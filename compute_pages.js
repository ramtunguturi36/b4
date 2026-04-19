const http = require('http');
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
const blockCost = (block) => {
  if (block.type === 'divider') return 64;
  if (block.type === 'highlight') {
    const textLength = block.text ? block.text.length : 0;
    const estimatedLines = Math.ceil(textLength / 50);
    return 84 + estimatedLines * 33;
  }
  const textLength = block.text ? block.text.length : 0;
  const estimatedLines = Math.ceil(textLength / 50);
  return Math.max(54, estimatedLines * 31 + 18);
};
function paginateContent(content, isMobile) {
  const pages = [];
  const maxUnits = isMobile ? 510 : 665;
  let current = [];
  let units = 0;
  for (const block of content) {
    const cost = blockCost(block);
    if (units + cost > maxUnits && current.length > 0) {
      pages.push(current);
      current = [];
      units = 0;
    }
    current.push(block);
    units += cost;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[{ type: 'paragraph', text: 'No content yet.' }]];
}
async function run() {
  const chapters = await get('http://localhost:5000/api/chapters');
  const sortedChapters = chapters.map(ch => {
    const match = ch.title.match(/\d+/);
    return { ...ch, extractedNumber: match ? parseInt(match[0]) : 0 };
  }).sort((a, b) => {
    if (a.extractedNumber !== b.extractedNumber) return a.extractedNumber - b.extractedNumber;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  let totalPages = 0;
  const targetNumbers = [34, 35, 36, 37, 38, 39, 40];
  const results = [];
  for (const ch of sortedChapters) {
    const detail = await get('http://localhost:5000/api/chapters/' + ch._id);
    const pages = paginateContent(detail.blocks || [], false);
    if (targetNumbers.includes(ch.extractedNumber)) {
      results.push({
        title: ch.title,
        extractedNumber: ch.extractedNumber,
        startPageIndex: totalPages,
        startPageNumber: totalPages + 1,
        parity: totalPages % 2 === 0 ? 'even' : 'odd'
      });
    }
    totalPages += pages.length;
  }
  console.log(JSON.stringify(results, null, 2));
  const subset = results.filter(r => r.extractedNumber >= 36 && r.extractedNumber <= 40);
  const all36to40Odd = subset.length === 5 && subset.every(r => r.startPageIndex % 2 !== 0);
  console.log('All 36-40 start on odd indices:', all36to40Odd);
}
run().catch(console.error);
