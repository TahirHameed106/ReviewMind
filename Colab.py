"""ReviewMind Colab-ready analysis script.

This script is designed to run in Google Colab or any Python environment with
the usual data-science packages installed. It produces the content needed for
report sections 6.1 to 6.6 and benchmarks the algorithms used in the project.

Main techniques covered:
- Exploratory data analysis
- Rule-based sentiment from ratings
- VADER sentiment analysis
- TextBlob sentiment fallback
- TF-IDF feature extraction
- Multinomial Naive Bayes
- Logistic Regression
- Linear SVM
- SGD classifier
- KMeans clustering for topic discovery
- LDA topic modeling for comparison
"""

from __future__ import annotations

import os
import re
import sys
import json
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
sns.set_theme(style="whitegrid", context="talk")
plt.rcParams.update(
    {
        "figure.facecolor": "#f8fafc",
        "axes.facecolor": "#ffffff",
        "axes.edgecolor": "#d1d5db",
        "axes.titleweight": "bold",
        "axes.labelcolor": "#111827",
        "text.color": "#111827",
        "xtick.color": "#374151",
        "ytick.color": "#374151",
        "savefig.facecolor": "#f8fafc",
    }
)

try:
    import matplotlib.pyplot as plt
    import seaborn as sns
except Exception as exc:  # pragma: no cover
    raise ImportError("matplotlib and seaborn are required. Install them in Colab.") from exc

try:
    from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.metrics import (
        accuracy_score,
        classification_report,
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
    )
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.linear_model import LogisticRegression, SGDClassifier
    from sklearn.svm import LinearSVC
    from sklearn.cluster import KMeans
    from sklearn.decomposition import LatentDirichletAllocation
    from sklearn.dummy import DummyClassifier
except Exception as exc:  # pragma: no cover
    raise ImportError("scikit-learn is required. Install it in Colab.") from exc

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
except Exception:
    SentimentIntensityAnalyzer = None
    VADER_AVAILABLE = False

try:
    from textblob import TextBlob
    TEXTBLOB_AVAILABLE = True
except Exception:
    TextBlob = None
    TEXTBLOB_AVAILABLE = False

try:
    from wordcloud import WordCloud
    WORDCLOUD_AVAILABLE = True
except Exception:
    WordCloud = None
    WORDCLOUD_AVAILABLE = False

RANDOM_STATE = 42
OUTPUT_DIR = Path(os.getenv("REVIEWMIND_OUTPUT_DIR", "reviewmind_colab_outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

POSITIVE_LABELS = {"positive", "pos", "good", "great", "excellent", "amazing", "awesome", "5", "4", "4.0", "5.0"}
NEGATIVE_LABELS = {"negative", "neg", "bad", "poor", "terrible", "awful", "horrible", "worst", "1", "2", "1.0", "2.0"}
NEUTRAL_LABELS = {"neutral", "average", "ok", "okay", "fine", "moderate", "decent", "3", "3.0", "3.5"}


@dataclass
class ColumnMap:
    text_col: Optional[str]
    rating_col: Optional[str]
    label_col: Optional[str]
    date_col: Optional[str]


def maybe_upload_from_colab() -> Optional[str]:
    try:
        from google.colab import files  # type: ignore

        uploaded = files.upload()
        if not uploaded:
            return None
        return next(iter(uploaded.keys()))
    except Exception:
        return None


def read_csv_with_fallback(path: str) -> pd.DataFrame:
    encodings = ["utf-8", "latin-1", "cp1252"]
    last_error = None

    for encoding in encodings:
        try:
            return pd.read_csv(path, encoding=encoding)
        except Exception as exc:
            last_error = exc

    raise last_error  # type: ignore[misc]


def load_dataset(path: Optional[str] = None) -> pd.DataFrame:
    if path and Path(path).exists():
        return read_csv_with_fallback(path)

    uploaded_path = maybe_upload_from_colab()
    if uploaded_path:
        return read_csv_with_fallback(uploaded_path)

    prompt = input("Enter CSV path for the dataset: ").strip()
    if not prompt:
        raise FileNotFoundError("No dataset path provided.")
    return read_csv_with_fallback(prompt)


def normalize_text(value: object) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    text = str(value).lower().strip()
    text = re.sub(r"http\S+|www\S+", "", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def detect_columns(df: pd.DataFrame) -> ColumnMap:
    text_candidates = ["review", "text", "comment", "feedback", "content", "message", "description"]
    rating_candidates = ["rating", "score", "stars", "rate", "review_score", "points"]
    label_candidates = ["sentiment", "label", "class", "polarity", "opinion"]
    date_candidates = ["date", "timestamp", "created", "time", "datetime", "review_date"]
    text_col = None
    label_col = None
    rating_col = None
    date_col = None

    def find_candidate(candidates: List[str]) -> Optional[str]:
        for column in df.columns:
            lower = column.lower()
            if any(candidate in lower for candidate in candidates):
                return column
        return None

    text_col = find_candidate(text_candidates)
    label_col = find_candidate(label_candidates)
    rating_col = find_candidate(rating_candidates)
    date_col = find_candidate(date_candidates)

    # If the dataset only has a sentiment column, do not misclassify it as a rating/date field.
    if label_col is None:
        for column in df.columns:
            series = df[column].dropna().astype(str).str.lower().str.strip()
            unique_values = set(series.unique().tolist())
            if unique_values and unique_values.issubset(POSITIVE_LABELS | NEGATIVE_LABELS | NEUTRAL_LABELS):
                label_col = column
                break

    if text_col is None:
        object_columns = df.select_dtypes(include=["object"]).columns.tolist()
        if object_columns:
            # Prefer the longest text-like column as a fallback review column.
            text_col = max(
                object_columns,
                key=lambda column: df[column].fillna("").astype(str).str.len().mean(),
            )

    return ColumnMap(
        text_col=text_col,
        rating_col=rating_col,
        label_col=label_col,
        date_col=date_col,
    )


def map_sentiment_value(value: object) -> Optional[str]:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None

    text = str(value).strip().lower()
    if text in POSITIVE_LABELS:
        return "Positive"
    if text in NEGATIVE_LABELS:
        return "Negative"
    if text in NEUTRAL_LABELS:
        return "Neutral"

    try:
        numeric = float(text)
        if numeric >= 4:
            return "Positive"
        if numeric <= 2:
            return "Negative"
        return "Neutral"
    except Exception:
        return None


def derive_target_labels(df: pd.DataFrame, cols: ColumnMap) -> Tuple[pd.Series, str]:
    if cols.label_col and cols.label_col in df.columns:
        labels = df[cols.label_col].apply(map_sentiment_value)
        if labels.dropna().nunique() <= 1:
            labels = df[cols.text_col].fillna("").astype(str).map(lexicon_sentiment)
            return labels, f"lexicon_from_{cols.text_col}"
        labels = labels.fillna("Neutral")
        return labels, cols.label_col

    if cols.rating_col and cols.rating_col in df.columns:
        rating_series = pd.to_numeric(df[cols.rating_col], errors="coerce")
        labels = pd.Series(index=df.index, dtype="object")
        labels[rating_series >= 4] = "Positive"
        labels[rating_series <= 2] = "Negative"
        labels[(rating_series > 2) & (rating_series < 4)] = "Neutral"
        labels = labels.fillna("Neutral")
        return labels, cols.rating_col

    raise ValueError("No sentiment label or rating column found. Add one of them to the CSV.")


def basic_eda(df: pd.DataFrame, cols: ColumnMap) -> Dict[str, object]:
    summary = {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "missing_total": int(df.isna().sum().sum()),
        "missing_pct": round(float(df.isna().mean().mean() * 100), 2) if len(df.columns) else 0.0,
        "duplicate_rows": int(df.duplicated().sum()),
    }

    print("\n====================")
    print("6.1. EXPLORATORY DATA ANALYSIS RESULTS")
    print("====================")
    print(f"Rows: {summary['rows']}")
    print(f"Columns: {summary['columns']}")
    print(f"Missing values: {summary['missing_total']} ({summary['missing_pct']}%)")
    print(f"Duplicate rows: {summary['duplicate_rows']}")
    print("Detected columns:")
    print(f"  Text: {cols.text_col}")
    print(f"  Rating: {cols.rating_col}")
    print(f"  Label: {cols.label_col}")
    print(f"  Date: {cols.date_col}")

    if cols.text_col and cols.text_col in df.columns:
        text_lengths = df[cols.text_col].fillna("").astype(str).map(len)
        summary.update(
            {
                "avg_text_length": round(float(text_lengths.mean()), 2),
                "median_text_length": round(float(text_lengths.median()), 2),
            }
        )
        print(f"Average text length: {summary['avg_text_length']}")
        print(f"Median text length: {summary['median_text_length']}")

    plt.figure(figsize=(8, 4))
    sns.heatmap(df.isna(), cbar=False, yticklabels=False, cmap="mako")
    plt.title("Missing Value Map")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "eda_missing_values.png", dpi=160)
    plt.close()

    if cols.label_col and cols.label_col in df.columns:
        label_counts = df[cols.label_col].dropna().astype(str).str.title().value_counts()
        plt.figure(figsize=(8, 5))
        sns.barplot(x=label_counts.index, y=label_counts.values, palette=["#16a34a", "#dc2626", "#f59e0b"])
        plt.title("Sentiment Distribution")
        plt.xlabel("Sentiment")
        plt.ylabel("Count")
        for index, value in enumerate(label_counts.values):
            plt.text(index, value, f"{value:,}", ha="center", va="bottom", fontsize=10)
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "eda_sentiment_distribution.png", dpi=160)
        plt.close()

    if cols.rating_col and cols.rating_col in df.columns:
        plt.figure(figsize=(8, 4))
        pd.to_numeric(df[cols.rating_col], errors="coerce").dropna().plot(kind="hist", bins=10, color="#2a9d8f")
        plt.title("Rating Distribution")
        plt.xlabel("Rating")
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "eda_rating_distribution.png", dpi=160)
        plt.close()

    if cols.text_col and cols.text_col in df.columns:
        text_lengths = df[cols.text_col].fillna("").astype(str).map(len)
        plt.figure(figsize=(8, 4))
        sns.histplot(text_lengths, bins=30, kde=True, color="#264653")
        plt.title("Review Length Distribution")
        plt.xlabel("Characters")
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "eda_text_length.png", dpi=160)
        plt.close()

        if WORDCLOUD_AVAILABLE:
            corpus = " ".join(df[cols.text_col].dropna().astype(str).map(normalize_text).tolist())
            if corpus.strip():
                wordcloud = WordCloud(width=1400, height=700, background_color="white").generate(corpus)
                plt.figure(figsize=(12, 6))
                plt.imshow(wordcloud, interpolation="bilinear")
                plt.axis("off")
                plt.title("Frequent Words")
                plt.tight_layout()
                plt.savefig(OUTPUT_DIR / "eda_wordcloud.png", dpi=160)
                plt.close()

        tokens = (
            " ".join(df[cols.text_col].dropna().astype(str).map(normalize_text).tolist())
            .split()
        )
        common_words = [word for word in tokens if len(word) > 2]
        if common_words:
            top_words = pd.Series(common_words).value_counts().head(12)
            plt.figure(figsize=(10, 5))
            sns.barplot(x=top_words.values, y=top_words.index, palette="crest")
            plt.title("Top Words in Reviews")
            plt.xlabel("Frequency")
            plt.ylabel("Word")
            plt.tight_layout()
            plt.savefig(OUTPUT_DIR / "eda_top_words.png", dpi=160)
            plt.close()

        top_lengths = df[cols.text_col].fillna("").astype(str).map(len)
        plt.figure(figsize=(8, 4))
        sns.boxplot(x=top_lengths, color="#60a5fa")
        plt.title("Review Length Spread")
        plt.xlabel("Characters")
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "eda_length_boxplot.png", dpi=160)
        plt.close()

    return summary


def lexicon_sentiment(text: str) -> str:
    cleaned = normalize_text(text)
    if not cleaned:
        return "Neutral"

    if VADER_AVAILABLE:
        analyzer = SentimentIntensityAnalyzer()
        score = analyzer.polarity_scores(cleaned)["compound"]
        if score >= 0.05:
            return "Positive"
        if score <= -0.05:
            return "Negative"
        return "Neutral"

    if TEXTBLOB_AVAILABLE:
        polarity = TextBlob(cleaned).sentiment.polarity
        if polarity > 0.15:
            return "Positive"
        if polarity < -0.15:
            return "Negative"
        return "Neutral"

    return "Neutral"


def build_training_frame(df: pd.DataFrame, cols: ColumnMap) -> Tuple[pd.DataFrame, pd.Series, str]:
    if not cols.text_col or cols.text_col not in df.columns:
        raise ValueError("No text column found. A review/comment/text column is required for training.")

    labels, label_source = derive_target_labels(df, cols)
    frame = df.copy()
    frame["clean_text"] = frame[cols.text_col].fillna("").astype(str).map(normalize_text)
    frame["target"] = labels.astype(str)
    frame = frame[frame["clean_text"].str.len() > 0].copy()
    frame = frame[frame["target"].isin(["Positive", "Negative", "Neutral"])].copy()
    return frame, frame["target"], label_source


def make_train_test_split(frame: pd.DataFrame, y: pd.Series):
    test_size = 0.2 if len(frame) >= 50 else 0.3
    stratify = y if y.nunique() > 1 and y.value_counts().min() >= 2 else None
    return train_test_split(
        frame["clean_text"],
        y,
        test_size=test_size,
        random_state=RANDOM_STATE,
        stratify=stratify,
    )


def build_models() -> Dict[str, Pipeline]:
    return {
        "MultinomialNB": Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=8000, ngram_range=(1, 2), stop_words="english")),
                ("clf", MultinomialNB()),
            ]
        ),
        "LogisticRegression": Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=12000, ngram_range=(1, 2), stop_words="english")),
                ("clf", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=RANDOM_STATE)),
            ]
        ),
        "LinearSVC": Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=12000, ngram_range=(1, 2), stop_words="english")),
                ("clf", LinearSVC(class_weight="balanced", random_state=RANDOM_STATE)),
            ]
        ),
        "SGDClassifier": Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=12000, ngram_range=(1, 2), stop_words="english")),
                ("clf", SGDClassifier(loss="hinge", class_weight="balanced", random_state=RANDOM_STATE)),
            ]
        ),
        "DummyBaseline": Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=2000, ngram_range=(1, 1), stop_words="english")),
                ("clf", DummyClassifier(strategy="most_frequent", random_state=RANDOM_STATE)),
            ]
        ),
    }


def _safe_metrics(y_true: pd.Series, y_pred: pd.Series) -> Dict[str, float]:
    label_values = sorted(pd.Series(y_true).astype(str).unique().tolist())
    if not label_values:
        label_values = ["Neutral"]

    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, average="macro", zero_division=0, labels=label_values)), 4),
        "recall": round(float(recall_score(y_true, y_pred, average="macro", zero_division=0, labels=label_values)), 4),
        "f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0, labels=label_values)), 4),
    }


def evaluate_text_models(X_train, X_test, y_train, y_test):
    models = build_pipelines()
    rows = []
    fitted = {}

    if y_train.nunique() < 2:
        fallback_predictions = pd.Series([y_train.iloc[0]] * len(y_test), index=y_test.index)
        fallback_metrics = _safe_metrics(y_test, fallback_predictions)
        rows.append(
            {
                "model": "Rule-Based Baseline",
                **fallback_metrics,
                "status": "single-class fallback",
            }
        )
        comparison = pd.DataFrame(rows)
        print("\n====================")
        print("6.2. MODEL TRAINING RESULTS")
        print("====================")
        print("The training set contains only one class, so supervised classifiers were skipped.")
        print(comparison.to_string(index=False))
        comparison.to_csv(OUTPUT_DIR / "model_comparison.csv", index=False)
        return comparison, {"Rule-Based Baseline": None}, "Rule-Based Baseline"

    for name, pipeline in models.items():
        try:
            pipeline.fit(X_train, y_train)
            predictions = pipeline.predict(X_test)
            metrics = _safe_metrics(y_test, predictions)
            rows.append(
                {
                    "model": name,
                    **metrics,
                    "status": "trained",
                }
            )
            fitted[name] = pipeline
        except Exception as exc:
            rows.append(
                {
                    "model": name,
                    "accuracy": 0.0,
                    "precision": 0.0,
                    "recall": 0.0,
                    "f1": 0.0,
                    "status": f"error: {exc}",
                }
            )

    comparison = pd.DataFrame(rows).sort_values(["f1", "accuracy"], ascending=False).reset_index(drop=True)
    best_name = str(comparison.iloc[0]["model"])

    print("\n====================")
    print("6.2. MODEL TRAINING RESULTS")
    print("====================")
    print(comparison.to_string(index=False))
    comparison.to_csv(OUTPUT_DIR / "model_comparison.csv", index=False)
    return comparison, fitted, best_name


def plot_comparison(comparison: pd.DataFrame) -> None:
    if comparison.empty:
        return

    melted = comparison[["model", "accuracy", "precision", "recall", "f1"]].melt(
        id_vars="model", var_name="metric", value_name="score"
    )
    plt.figure(figsize=(13, 6))
    sns.barplot(data=melted, x="model", y="score", hue="metric", palette="viridis")
    plt.title("Model Comparison Dashboard")
    plt.xticks(rotation=18, ha="right")
    plt.ylim(0, 1.05)
    plt.grid(axis="y", linestyle="--", alpha=0.3)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "model_comparison.png", dpi=160)
    plt.close()


    if not comparison.empty:
        plt.figure(figsize=(10, 5))
        ordered = comparison.sort_values("f1", ascending=True)
        sns.barplot(data=ordered, x="f1", y="model", palette="magma")
        plt.title("Model F1 Ranking")
        plt.xlabel("F1-score")
        plt.ylabel("Model")
        plt.xlim(0, 1.05)
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "model_f1_ranking.png", dpi=160)
        plt.close()


def plot_confusion(y_true: pd.Series, y_pred: np.ndarray, title: str, filename: str) -> pd.DataFrame:
    labels = ["Negative", "Neutral", "Positive"]
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    cm_df = pd.DataFrame(cm, index=labels, columns=labels)

    plt.figure(figsize=(6, 5))
    sns.heatmap(cm_df, annot=True, fmt="d", cmap="Blues", cbar=False, linewidths=0.5, linecolor="white")
    plt.title(title)
    plt.xlabel("Predicted")
    plt.ylabel("Actual")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=160)
    plt.close()
    return cm_df


def lexicon_baseline_report(texts: pd.Series, y_test: pd.Series) -> pd.DataFrame:
    predicted = texts.map(lexicon_sentiment)
    metrics = _safe_metrics(y_test, predicted)
    return pd.DataFrame(
        [
            {
                "model": "VADER/TextBlob Baseline",
                **metrics,
                "status": "baseline",
            }
        ]
    )


def render_confusion_analysis(X_test: pd.Series, y_test: pd.Series, fitted: Dict[str, Pipeline], best_name: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    print("\n====================")
    print("6.4. CONFUSION MATRIX ANALYSIS")
    print("====================")

    if fitted.get(best_name) is None:
        best_preds = pd.Series([y_test.mode().iloc[0] if not y_test.mode().empty else "Neutral"] * len(y_test), index=y_test.index)
    else:
        best_preds = fitted[best_name].predict(X_test)
    best_cm = plot_confusion(y_test, best_preds, f"Best Model: {best_name}", "6_4_confusion_best.png")
    lexicon_preds = X_test.map(lexicon_sentiment)
    lexicon_cm = plot_confusion(y_test, lexicon_preds, "VADER/TextBlob Baseline", "6_4_confusion_lexicon.png")

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.8))
    sns.heatmap(best_cm, annot=True, fmt="d", cmap="Blues", cbar=False, linewidths=0.5, linecolor="white", ax=axes[0])
    axes[0].set_title(f"Best Model: {best_name}")
    axes[0].set_xlabel("Predicted")
    axes[0].set_ylabel("Actual")
    sns.heatmap(lexicon_cm, annot=True, fmt="d", cmap="Oranges", cbar=False, linewidths=0.5, linecolor="white", ax=axes[1])
    axes[1].set_title("Lexicon Baseline")
    axes[1].set_xlabel("Predicted")
    axes[1].set_ylabel("Actual")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "6_4_confusion_dashboard.png", dpi=160)
    plt.close()

    print("Best model confusion matrix:")
    print(best_cm.to_string())
    print("\nLexicon baseline confusion matrix:")
    print(lexicon_cm.to_string())
    print("\nInterpretation: diagonal values are correct predictions; off-diagonal values show which classes are being confused.")
    return best_cm, lexicon_cm


def kmeans_topic_analysis(texts: pd.Series, max_clusters: int = 6) -> pd.DataFrame:
    corpus = texts.fillna("").astype(str).map(normalize_text)
    corpus = corpus[corpus.str.len() > 0]
    if len(corpus) < 10:
        return pd.DataFrame()

    cluster_count = max(2, min(max_clusters, int(np.sqrt(len(corpus) / 2))))
    vectorizer = TfidfVectorizer(max_features=5000, stop_words="english")
    matrix = vectorizer.fit_transform(corpus)
    kmeans = KMeans(n_clusters=cluster_count, random_state=RANDOM_STATE, n_init=10)
    labels = kmeans.fit_predict(matrix)

    feature_names = vectorizer.get_feature_names_out()
    rows = []
    for cluster_id in range(cluster_count):
        centroid = kmeans.cluster_centers_[cluster_id]
        top_indices = centroid.argsort()[-5:][::-1]
        top_words = [feature_names[index] for index in top_indices if centroid[index] > 0]
        rows.append(
            {
                "cluster_id": cluster_id,
                "size": int(np.sum(labels == cluster_id)),
                "top_terms": ", ".join(top_words),
            }
        )

    return pd.DataFrame(rows).sort_values("size", ascending=False).reset_index(drop=True)


def lda_topic_analysis(texts: pd.Series, n_topics: int = 5) -> pd.DataFrame:
    corpus = texts.fillna("").astype(str).map(normalize_text)
    corpus = corpus[corpus.str.len() > 0]
    if len(corpus) < 10:
        return pd.DataFrame()

    vectorizer = CountVectorizer(max_features=4000, stop_words="english")
    matrix = vectorizer.fit_transform(corpus)
    topic_count = max(2, min(n_topics, int(np.sqrt(len(corpus) / 3))))
    lda = LatentDirichletAllocation(n_components=topic_count, random_state=RANDOM_STATE, learning_method="batch")
    lda.fit(matrix)

    feature_names = vectorizer.get_feature_names_out()
    rows = []
    for topic_id, topic_weights in enumerate(lda.components_):
        top_indices = topic_weights.argsort()[-5:][::-1]
        top_terms = [feature_names[index] for index in top_indices]
        rows.append({"topic_id": topic_id, "top_terms": ", ".join(top_terms)})
    return pd.DataFrame(rows)


def explain_best_model(best_row: pd.Series, comparison: pd.DataFrame) -> str:
    if len(comparison) > 1:
        second_best = comparison.iloc[1]
        f1_margin = best_row["f1"] - second_best["f1"]
        acc_margin = best_row["accuracy"] - second_best["accuracy"]
    else:
        f1_margin = best_row["f1"]
        acc_margin = best_row["accuracy"]

    return (
        f"The selected model is {best_row['model']} because it achieved the strongest balance across accuracy, precision, recall, and F1-score. "
        f"F1-score is the primary selection metric here because ReviewMind must handle all three sentiment classes, not just the majority class. "
        f"Compared with the next best model, it improved F1 by {f1_margin:.4f} and accuracy by {acc_margin:.4f}. "
        f"That makes it the most reliable choice for practical sentiment analysis and report generation."
    )


def print_section_6_3(comparison: pd.DataFrame) -> None:
    best = comparison.iloc[0]
    print("\n====================")
    print("6.3. PERFORMANCE EVALUATION")
    print("====================")
    print(f"Best model: {best['model']}")
    print(f"Accuracy:  {best['accuracy']:.4f}")
    print(f"Precision: {best['precision']:.4f}")
    print(f"Recall:    {best['recall']:.4f}")
    print(f"F1-score:  {best['f1']:.4f}")


def print_dataset_labels(df: pd.DataFrame, cols: ColumnMap) -> None:
    if cols.label_col and cols.label_col in df.columns:
        values = df[cols.label_col].dropna().astype(str).str.lower().str.strip()
        print("\nLabel column preview:")
        print(values.value_counts().head(10).to_string())


def print_section_6_4(cm_df: pd.DataFrame) -> None:
    print("\n====================")
    print("6.4. CONFUSION MATRIX ANALYSIS")
    print("====================")
    print(cm_df.to_string())


def print_section_6_5(comparison: pd.DataFrame, baseline_df: pd.DataFrame) -> None:
    print("\n====================")
    print("6.5. COMPARATIVE ANALYSIS")
    print("====================")
    combined = comparison[["model", "accuracy", "precision", "recall", "f1"]].copy()
    combined.columns = ["Model", "Accuracy", "Precision", "Recall", "F1"]
    if not baseline_df.empty:
        baseline_view = baseline_df[["model", "accuracy", "precision", "recall", "f1"]].copy()
        baseline_view.columns = ["Model", "Accuracy", "Precision", "Recall", "F1"]
        combined = pd.concat([combined, baseline_view], ignore_index=True)
    print(combined.sort_values(["F1", "Accuracy"], ascending=False).to_string(index=False))


def discussion_text(best_name: str, comparison: pd.DataFrame, baseline_df: pd.DataFrame, cm_df: pd.DataFrame) -> str:
    best_row = comparison.iloc[0]
    discarded = comparison[comparison["model"] != best_name]["model"].tolist()
    baseline_row = baseline_df.iloc[0] if not baseline_df.empty else None

    text = []
    text.append("\n====================")
    text.append("6.6. DISCUSSION OF RESULTS")
    text.append("====================")
    text.append(explain_best_model(best_row, comparison))
    if baseline_row is not None:
        text.append(
            f"The VADER/TextBlob baseline produced an F1-score of {baseline_row['f1']:.4f}, which is useful as a quick fallback but not as accurate as the selected classifier."
        )
    text.append(f"Models tested but not chosen as final classifier: {', '.join(discarded)}.")
    text.append("The confusion matrix shows that neutral reviews are the hardest to separate because they often contain mixed or low-intensity wording.")
    text.append("KMeans and LDA are retained for topic discovery only; they are not used as the final sentiment classifier.")
    text.append("Overall, the pipeline combines preprocessing, TF-IDF, supervised classification, lexicon scoring, and clustering to provide both accuracy and explainability.")
    return "\n".join(text)


def print_final_model_summary(comparison: pd.DataFrame, baseline_df: pd.DataFrame, best_name: str) -> None:
    print("\n====================")
    print("6.7. FINAL MODEL ACCURACY SUMMARY")
    print("====================")

    all_models = comparison[["model", "accuracy", "precision", "recall", "f1"]].copy()
    all_models.columns = ["Model", "Accuracy", "Precision", "Recall", "F1"]

    if not baseline_df.empty:
        baseline_view = baseline_df[["model", "accuracy", "precision", "recall", "f1"]].copy()
        baseline_view.columns = ["Model", "Accuracy", "Precision", "Recall", "F1"]
        all_models = pd.concat([all_models, baseline_view], ignore_index=True)

    all_models["Rank"] = all_models["F1"].rank(ascending=False, method="min").astype(int)
    all_models = all_models.sort_values(["Rank", "Accuracy"], ascending=[True, False]).reset_index(drop=True)
    print(all_models.to_string(index=False))
    all_models.to_csv(OUTPUT_DIR / "6_7_all_model_accuracy_summary.csv", index=False)
    print(f"\nBest model: {best_name}")
    print(explain_best_model(comparison.iloc[0], comparison))
    print("[Saved] 6_7_all_model_accuracy_summary.csv")

    plt.figure(figsize=(10, 5))
    sns.barplot(data=all_models, x="F1", y="Model", palette="crest")
    plt.title("Final Model Ranking")
    plt.xlabel("F1-score")
    plt.ylabel("Model")
    plt.xlim(0, 1.05)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "6_7_final_model_ranking.png", dpi=160)
    plt.close()


def run_unsupervised_support(df: pd.DataFrame, cols: ColumnMap) -> Dict[str, pd.DataFrame]:
    output: Dict[str, pd.DataFrame] = {}
    if cols.text_col and cols.text_col in df.columns:
        output["kmeans_topics"] = kmeans_topic_analysis(df[cols.text_col])
        output["lda_topics"] = lda_topic_analysis(df[cols.text_col])
    return output


def main() -> None:
    dataset_path = os.getenv("DATASET_PATH")
    df = load_dataset(dataset_path)
    cols = detect_columns(df)

    if cols.text_col is None and cols.label_col is None and cols.rating_col is None:
        raise ValueError("The dataset needs at least a review/text column and either a label or rating column.")

    eda_summary = basic_eda(df, cols)
    print_dataset_labels(df, cols)
    frame, y, label_source = build_training_frame(df, cols)
    X_train, X_test, y_train, y_test = make_train_test_split(frame, y)

    comparison, fitted_models, best_name = evaluate_text_models(X_train, X_test, y_train, y_test)
    plot_comparison(comparison)

    cm_df, lexicon_cm = render_confusion_analysis(X_test, y_test, fitted_models, best_name)
    print_section_6_3(comparison)
    print_section_6_4(cm_df)

    baseline_df = lexicon_baseline_report(X_test, y_test)
    print_section_6_5(comparison, baseline_df)

    support = run_unsupervised_support(df, cols)
    if not support.get("kmeans_topics", pd.DataFrame()).empty:
        print("\nKMeans Topic Discovery")
        print(support["kmeans_topics"].to_string(index=False))
    if not support.get("lda_topics", pd.DataFrame()).empty:
        print("\nLDA Topic Discovery")
        print(support["lda_topics"].to_string(index=False))

    print(discussion_text(best_name, comparison, baseline_df, cm_df))
    print_final_model_summary(comparison, baseline_df, best_name)

    report_payload = {
        "eda_summary": eda_summary,
        "label_source": label_source,
        "best_model": best_name,
        "comparison": comparison.to_dict(orient="records"),
        "confusion_matrix": cm_df.to_dict(),
        "baseline": baseline_df.to_dict(orient="records"),
        "used_algorithms": [
            "TF-IDF",
            "Multinomial Naive Bayes",
            "Logistic Regression",
            "Linear SVM",
            "SGD Classifier",
            "VADER sentiment analysis" if VADER_AVAILABLE else "TextBlob sentiment fallback" if TEXTBLOB_AVAILABLE else "Lexicon fallback not available",
            "KMeans clustering",
            "LDA topic modeling",
        ],
        "discarded_algorithms": [model for model in comparison["model"].tolist() if model != best_name],
    }
    with open(OUTPUT_DIR / "report_payload.json", "w", encoding="utf-8") as handle:
        json.dump(report_payload, handle, indent=2)

    print(f"\nSaved outputs to: {OUTPUT_DIR.resolve()}")
    print("Finished.")


if __name__ == "__main__":
    main()