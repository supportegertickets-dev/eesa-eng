const path = require('path');
const multer = require('multer');

const storage = multer.memoryStorage();

const TYPES_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain'
};

// Browsers on some phones label Office documents as a generic binary. The
// extension is then the only clue, and rejecting a valid file is worse.
const GENERIC_TYPES = ['', 'application/octet-stream', 'binary/octet-stream'];

const fileFilter = (req, file, cb) => {
  if (GENERIC_TYPES.includes(file.mimetype)) {
    const inferred = TYPES_BY_EXTENSION[path.extname(file.originalname || '').toLowerCase()];
    if (inferred) file.mimetype = inferred;
  }

  const allowed = [...new Set(Object.values(TYPES_BY_EXTENSION))];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported'), false);
  }
};

const imageFilter = (req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedImages.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Formal documents such as the constitution: the formats the browser can read
// text out of, plus legacy Word for keeping the original on file.
const DOCUMENT_TYPES = [
  TYPES_BY_EXTENSION['.pdf'],
  TYPES_BY_EXTENSION['.docx'],
  TYPES_BY_EXTENSION['.doc'],
  TYPES_BY_EXTENSION['.txt']
];

const documentFilter = (req, file, cb) => {
  if (GENERIC_TYPES.includes(file.mimetype)) {
    const inferred = TYPES_BY_EXTENSION[path.extname(file.originalname || '').toLowerCase()];
    if (inferred) file.mimetype = inferred;
  }
  if (DOCUMENT_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('File type not supported'), false);
};

const uploadFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadDocument = multer({
  storage,
  fileFilter: documentFilter,
  // The document's articles travel alongside it as a text field, which
  // multer would otherwise cap at 1MB.
  limits: { fileSize: 20 * 1024 * 1024, fieldSize: 2 * 1024 * 1024 } // 20MB file, 2MB text
});

module.exports = { uploadFile, uploadImage, uploadDocument };
