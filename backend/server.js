const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const client = new Anthropic();

app.use(cors());
app.use(express.json());

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const currency = req.body.currency || 'USD';
    const country = req.body.country || 'United States';
    const productText = (req.body.productText || '').trim();

    const hasImage = !!req.file;
    const hasText = productText.length > 0;

    if (!hasImage && !hasText) {
      return res.status(400).json({ error: 'Please provide an image or a product name.' });
    }

    const prompt = `You are a product research assistant. The user is in ${country} and wants all prices in ${currency}. Analyze the ${hasImage ? 'product image' : `product: "${productText}"`} and respond with ONLY a valid JSON object in this exact format:
{
  "productName": "name of the product",
  "currency": "${currency}",
  "manufacturingCost": 0.56,
  "wholesalePrice": 1.20,
  "retailPrice": 2.49,
  "history": "2-3 sentence history of this product or product category",
  "confidence": "Low / Medium / High",
  "profitMarginComparison": {
    "industry": "the specific industry this product belongs to (e.g. Groceries, Electronics, Apparel)",
    "productMargin": 28,
    "industryAvgMargin": 22,
    "rating": "high"
  },
  "disclaimer": "These are AI-estimated figures for educational purposes only, not real market data."
}

Rules:
- manufacturingCost, wholesalePrice, retailPrice must be plain numbers (no currency symbols, no strings) in ${currency}, reflecting ${country} market pricing
- For profitMarginComparison:
  - "industry": name the specific industry (Groceries, Electronics, Apparel, Beverages, Pharmaceuticals, etc.)
  - "productMargin": estimated gross profit margin % for this product (number only)
  - "industryAvgMargin": typical average gross profit margin % for that industry (number only)
  - "rating": "high" if productMargin is significantly above industry avg (>5pp), "medium" if within ~5pp, "low" if below industry avg`;

    // Build message content — image + prompt if image provided, otherwise just prompt
    const content = [];
    if (hasImage) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: req.file.mimetype,
          data: req.file.buffer.toString('base64'),
        },
      });
    }
    content.push({ type: 'text', text: prompt });

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    const rawText = message.content[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
