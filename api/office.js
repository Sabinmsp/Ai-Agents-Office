import { handleRequest } from '../server.js';

export default function office(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const endpoint = url.searchParams.get('endpoint');
  if (endpoint !== null) req.url = `/api/${endpoint}`;
  return handleRequest(req, res);
}
