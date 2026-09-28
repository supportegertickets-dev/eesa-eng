/**
 * Constitution and partnership enquiry tests.
 *
 * Covers uploading a version with its articles, publishing, what the public can
 * see, and enquiries from the Partner with us page. Cloudinary is stubbed and
 * MongoDB runs in memory.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { registerApproved } = require('./helpers');

const cloudinary = require('../config/cloudinary');

let uploadCount = 0;
const uploads = [];
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    uploadCount += 1;
    uploads.push(options);
    const publicId = `${options.folder}/${options.public_id || `test-${uploadCount}`}`;
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/raw/upload/v1/${publicId}`,
      public_id: publicId
    }));
  }
});
cloudinary.uploader.destroy = async (publicId) => {
  destroyed.push(publicId);
  return { result: 'ok' };
};

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

const SECTIONS = [
  { number: '', title: 'Preamble', body: 'We, the engineering students of Egerton University...' },
  { number: 'I', title: 'Name', body: '1.1 The association shall be called EESA.' },
  { number: 'II', title: 'Membership', body: '2.1 Membership is open to all engineering students.\n2.2 Members pay a subscription each semester.' }
];

let mongod;
let app;
let User;
let Constitution;
let Contact;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Constitution = require('../models/Constitution');
  Contact = require('../models/Contact');

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/constitution', require('../routes/constitution'));
  app.use('/api/contact', require('../routes/contact'));
  app.use(notFound);
  app.use(errorHandler);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const makeUser = async (role = 'member') => {
  const user = await registerApproved(app);
  if (role !== 'member') await User.updateOne({ _id: user.id }, { role });
  return user;
};

const uploadVersion = (user, { version = '1.0', publish = false, sections = SECTIONS, file = true } = {}) => {
  const req = request(app)
    .post('/api/constitution')
    .set(user.auth)
    .field('version', version)
    .field('adoptedOn', '2025-10-01')
    .field('sections', JSON.stringify(sections))
    .field('publish', String(publish));
  return file ? req.attach('file', PDF, { filename: 'EESA Constitution.pdf', contentType: 'application/pdf' }) : req;
};

describe('constitution', () => {
  test('only the admin and chairperson can upload a version', async () => {
    for (const role of ['member', 'secretary_general', 'treasurer']) {
      const user = await makeUser(role);
      assert.equal((await uploadVersion(user)).status, 403);
    }
  });

  test('an upload stores the original as a raw file, with its articles, as a draft', async () => {
    const admin = await makeUser('admin');
    const res = await uploadVersion(admin, { version: '1.0' });
    assert.equal(res.status, 201, res.body.message);

    const { constitution } = res.body;
    assert.equal(constitution.status, 'draft');
    assert.equal(constitution.isCurrent, false);
    assert.equal(constitution.sections.length, 3);
    assert.equal(constitution.sections[2].body, SECTIONS[2].body);
    assert.equal(constitution.file.name, 'EESA Constitution.pdf');
    assert.equal(uploads.at(-1).resource_type, 'raw');

    // Drafts stay off the public page.
    const pub = await request(app).get('/api/constitution');
    assert.equal(pub.body.constitution, null);
    assert.equal((await request(app).get(`/api/constitution/versions/${constitution._id}`)).status, 404);
    assert.equal((await request(app).get(`/api/constitution/versions/${constitution._id}`).set(admin.auth)).status, 200);
  });

  test('a version needs a number and at least one titled article', async () => {
    const admin = await makeUser('admin');
    assert.equal((await uploadVersion(admin, { version: '' })).status, 400);
    assert.equal((await uploadVersion(admin, { sections: [] })).status, 400);
    const untitled = await uploadVersion(admin, { sections: [{ title: '', body: 'text' }] });
    assert.equal(untitled.status, 400);
    assert.match(untitled.body.message, /Article 1 needs a title/);
  });

  test('other file types are refused', async () => {
    const admin = await makeUser('admin');
    const res = await request(app)
      .post('/api/constitution')
      .set(admin.auth)
      .field('version', '1.0')
      .field('sections', JSON.stringify(SECTIONS))
      .attach('file', Buffer.from('GIF89a'), { filename: 'photo.gif', contentType: 'image/gif' });
    assert.equal(res.status, 400);
  });

  test('publishing makes one version current and keeps the others listed', async () => {
    await Constitution.deleteMany({});
    const admin = await makeUser('chairperson');
    const first = await uploadVersion(admin, { version: '1.0', publish: true });
    assert.equal(first.body.constitution.isCurrent, true);

    const second = await uploadVersion(admin, { version: '2.0' });
    const published = await request(app).post(`/api/constitution/${second.body.constitution._id}/publish`).set(admin.auth);
    assert.equal(published.status, 200, published.body.message);

    const pub = await request(app).get('/api/constitution');
    assert.equal(pub.body.constitution.version, '2.0');
    assert.deepEqual(pub.body.versions.map((v) => v.version).sort(), ['1.0', '2.0']);
    assert.equal(await Constitution.countDocuments({ isCurrent: true }), 1);

    // Earlier published versions remain readable.
    assert.equal((await request(app).get(`/api/constitution/versions/${first.body.constitution._id}`)).status, 200);
  });

  test('articles can be corrected after upload', async () => {
    const admin = await makeUser('admin');
    const created = await uploadVersion(admin, { version: '3.0' });
    const edited = [...SECTIONS, { number: 'III', title: 'Office Bearers', body: '3.1 The executive committee...' }];

    const res = await request(app)
      .put(`/api/constitution/${created.body.constitution._id}`)
      .set(admin.auth)
      .send({ sections: edited, summary: 'Adds the office bearers.' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.constitution.sections.length, 4);
    assert.equal(res.body.constitution.summary, 'Adds the office bearers.');
  });

  test('the current version cannot be deleted; an older one can, with its file', async () => {
    await Constitution.deleteMany({});
    const admin = await makeUser('admin');
    const old = await uploadVersion(admin, { version: '1.0', publish: true });
    const current = await uploadVersion(admin, { version: '2.0', publish: true });

    assert.equal((await request(app).delete(`/api/constitution/${current.body.constitution._id}`).set(admin.auth)).status, 409);
    assert.equal((await request(app).delete(`/api/constitution/${old.body.constitution._id}`).set(admin.auth)).status, 200);
    assert.ok(destroyed.includes(old.body.constitution.file.publicId));
  });

  test('the original document downloads under a readable name', async () => {
    await Constitution.deleteMany({});
    const admin = await makeUser('admin');
    const created = await uploadVersion(admin, { version: '2.1', publish: true });

    const realFetch = global.fetch;
    global.fetch = async () => new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } });
    try {
      const res = await request(app).get(`/api/constitution/versions/${created.body.constitution._id}/file?download=1`);
      assert.equal(res.status, 200);
      assert.match(res.headers['content-disposition'], /attachment; filename="EESA-Constitution-v2\.1\.pdf"/);
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe('partnership enquiries', () => {
  const enquiry = (fields) => request(app).post('/api/contact').send({
    name: 'Jane Wanjiru',
    email: 'jane@acme.co.ke',
    subject: 'Partnership enquiry',
    message: 'We would like to sponsor your annual engineering fair.',
    ...fields
  });

  test('a partnership enquiry needs an organisation and is stored with its details', async () => {
    assert.equal((await enquiry({ category: 'partnership' })).status, 400);

    const res = await enquiry({ category: 'partnership', organization: 'Acme Engineering Ltd', phone: '+254 712 345 678', interest: 'Event sponsorship' });
    assert.equal(res.status, 201, res.body.message);

    const saved = await Contact.findOne({ organization: 'Acme Engineering Ltd' }).lean();
    assert.equal(saved.category, 'partnership');
    assert.equal(saved.interest, 'Event sponsorship');
  });

  test('ordinary messages are unchanged and ignore partnership fields', async () => {
    const res = await enquiry({ organization: 'Should be ignored' });
    assert.equal(res.status, 201);
    const saved = await Contact.findOne({ email: 'jane@acme.co.ke', category: 'general' }).lean();
    assert.equal(saved.organization, undefined);
  });

  test('administrators can filter the inbox to partnership enquiries', async () => {
    const admin = await makeUser('admin');
    const res = await request(app).get('/api/contact?category=partnership').set(admin.auth);
    assert.equal(res.status, 200);
    assert.ok(res.body.messages.length >= 1);
    assert.ok(res.body.messages.every((m) => m.category === 'partnership'));
    assert.ok(res.body.unreadPartnerships >= 1);

    const general = await request(app).get('/api/contact?category=general').set(admin.auth);
    assert.ok(general.body.messages.every((m) => m.category !== 'partnership'));
  });
});
