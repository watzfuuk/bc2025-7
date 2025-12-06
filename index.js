require('dotenv').config(); 
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const mongoose = require('mongoose');

const app = express();

const HOST = process.env.HOST || '0.0.0.0'; 
const PORT = process.env.PORT || 3000;
const RELATIVE_UPLOADS_DIR = process.env.CACHE_DIR || 'uploads';
const DB_URL = process.env.DB_URL || 'mongodb://localhost:27017/bc2025-7';

const ABSOLUTE_UPLOADS_DIR = path.resolve(__dirname, RELATIVE_UPLOADS_DIR);

if (!fs.existsSync(ABSOLUTE_UPLOADS_DIR)) {
  console.log(`Uploads directory not found. Creating directory: ${ABSOLUTE_UPLOADS_DIR}`);
  fs.mkdirSync(ABSOLUTE_UPLOADS_DIR, { recursive: true });
}

mongoose.connect(DB_URL)
  .then(() => console.log(`Connected to DB at ${DB_URL}`))
  .catch((err) => console.error('DB connection error:', err));


const InventorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, 
  name: { type: String, required: true },
  description: { type: String },
  photoUrl: { type: String }
});

const InventoryItem = mongoose.model('InventoryItem', InventorySchema);

const swaggerDocument = YAML.load('./swagger.yaml');

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] New request: ${req.method} ${req.originalUrl}`);
  next(); 
});

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use('/photos', express.static(ABSOLUTE_UPLOADS_DIR)); 
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ABSOLUTE_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });


app.get('/RegisterForm.html', (req, res) => res.sendFile(path.join(__dirname, 'RegisterForm.html')));
app.get('/SearchForm.html', (req, res) => res.sendFile(path.join(__dirname, 'SearchForm.html')));



app.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { inventory_name, description } = req.body;
    if (!inventory_name) {
      return res.status(400).json({ message: 'Inventory name is required' });
    }
    
    
    const newItem = new InventoryItem({
      id: uuidv4(),
      name: inventory_name,
      description: description || '',
      photoUrl: req.file ? `/photos/${req.file.filename}` : null
    });

    await newItem.save(); 
    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/inventory', async (req, res) => {
  try {
    const items = await InventoryItem.find(); 
    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/inventory/:id', async (req, res) => {
    try {
      const item = await InventoryItem.findOne({ id: req.params.id });
      if (!item) return res.status(404).json({ message: 'Item not found' });
      res.status(200).json(item);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
});

app.put('/inventory/:id', upload.single('photo'), async (req, res) => {
    try {
      
      const { name, description } = req.body;
      const updateData = {};

      
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      if (req.file) {
        updateData.photoUrl = `/photos/${req.file.filename}`;
      }

      const item = await InventoryItem.findOneAndUpdate(
        { id: req.params.id }, 
        updateData, 
        { new: true } 
      );

      if (!item) return res.status(404).json({ message: 'Item not found' });
      
      res.status(200).json(item);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
});

app.delete('/inventory/:id', async (req, res) => {
    try {
      const result = await InventoryItem.findOneAndDelete({ id: req.params.id });
      if (!result) return res.status(404).json({ message: 'Item not found' });
      res.status(200).json({ message: 'Item deleted successfully' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
});

app.post('/search', async (req, res) => {
    try {
      const { id, includePhoto } = req.body;
      const item = await InventoryItem.findOne({ id: id });
      
      if (!item) return res.status(404).send('<h2>Item not found by ID</h2>');
      
      
      const itemResponse = item.toObject();
      
      if (includePhoto === 'on' && itemResponse.photoUrl) {
          const fullPhotoUrl = `http://localhost:${PORT}${itemResponse.photoUrl}`; 
          itemResponse.description += `\n\n[Photo Link: ${fullPhotoUrl}]`;
      }
      res.status(200).json(itemResponse);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

app.all('/inventory/:id', (req, res) => res.status(405).send('Method Not Allowed'));
app.all('/register', (req, res) => res.status(405).send('Method Not Allowed'));
app.all('/inventory', (req, res) => res.status(405).send('Method Not Allowed'));
app.all('/search', (req, res) => res.status(405).send('Method Not Allowed'));

app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
  console.log(`Uploads are stored in: ${ABSOLUTE_UPLOADS_DIR}`);
  console.log(`API documentation is available at http://${HOST}:${PORT}/docs`);
});