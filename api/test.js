export default async function handler(req, res) {
  res.setHeader("Content-Type", "image/svg+xml");
  res.status(200).send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="10" y="30" font-size="20">test ok</text></svg>`);
}
