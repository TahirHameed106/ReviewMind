const express = require('express');
const router = express.Router();
const mlController = require('../controllers/mlController');
const multer = require('multer');
const upload = multer({
	dest: 'uploads/',
	limits: {
		fileSize: 100 * 1024 * 1024,
		fieldSize: 25 * 1024 * 1024,
		fields: 20,
		files: 1
	}
});

router.post('/upload', upload.single('file'), mlController.handleCSVUpload);
router.post('/analyze', mlController.getReviewInsights);

router.use((error, req, res, next) => {
	if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
		return res.status(413).json({
			error: 'CSV file is too large for direct upload. Please split the file or use a smaller dataset.'
		});
	}

	return next(error);
});

module.exports = router;