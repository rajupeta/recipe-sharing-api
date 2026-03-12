const request = require('supertest');
const app = require('../src/app');

describe('GET /health — edge cases', () => {
  it('should return Content-Type application/json', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('should return exactly {status: "ok"} with no extra keys', async () => {
    const res = await request(app).get('/health');
    expect(Object.keys(res.body)).toEqual(['status']);
    expect(res.body.status).toBe('ok');
  });

  it('should respond to HEAD /health', async () => {
    const res = await request(app).head('/health');
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should handle large JSON body without crashing', async () => {
    const largeBody = { data: 'x'.repeat(10000) };
    const res = await request(app)
      .post('/health')
      .send(largeBody)
      .set('Content-Type', 'application/json');
    // POST /health is not defined, expect 404 but no crash
    expect(res.status).toBe(404);
  });

  it('should handle malformed JSON gracefully', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');
    // Express should return 400 for malformed JSON
    expect(res.status).toBe(400);
  });
});

describe('Server entry point', () => {
  it('src/server.js should export or require app', () => {
    const fs = require('fs');
    const path = require('path');
    const serverContent = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'),
      'utf8'
    );
    expect(serverContent).toContain("require('./app')");
    expect(serverContent).toContain('process.env.PORT');
  });

  it('should default to port 3000 when PORT is not set', () => {
    const fs = require('fs');
    const path = require('path');
    const serverContent = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'),
      'utf8'
    );
    expect(serverContent).toMatch(/3000/);
  });
});
