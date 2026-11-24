const express = require('express');

const app = express();
const PORT = process.env.BACKEND_PORT || 4000;

app.use(express.json());

const products = [
  { id: 1, name: 'Quantum Core Processor', price: 299.99, category: 'Hardware' },
  { id: 2, name: 'Neural Network Accelerator', price: 449.50, category: 'Hardware' },
  { id: 3, name: 'CyberShield Antivirus Pro', price: 79.99, category: 'Software' },
  { id: 4, name: 'CloudSync Enterprise License', price: 199.00, category: 'Software' },
  { id: 5, name: 'Titan Mesh Wi-Fi Router', price: 129.95, category: 'Networking' }
];

const users = [
  { id: 1, name: 'Alice Cooper', email: 'alice.cooper@example.test', role: 'admin' },
  { id: 2, name: 'Bob Sterling', email: 'bob.sterling@example.test', role: 'editor' },
  { id: 3, name: 'Charlie Dave', email: 'charlie.dave@example.test', role: 'viewer' },
  { id: 4, name: 'Diana Prince', email: 'diana.prince@example.test', role: 'viewer' },
  { id: 5, name: 'Evan Wright', email: 'evan.wright@example.test', role: 'developer' }
];

const orders = [
  { id: 101, product: 'Quantum Core Processor', quantity: 2, status: 'completed', total: 599.98 },
  { id: 102, product: 'CyberShield Antivirus Pro', quantity: 5, status: 'processing', total: 399.95 },
  { id: 103, product: 'Titan Mesh Wi-Fi Router', quantity: 1, status: 'shipped', total: 129.95 },
  { id: 104, product: 'Neural Network Accelerator', quantity: 1, status: 'pending', total: 449.50 },
  { id: 105, product: 'CloudSync Enterprise License', quantity: 3, status: 'completed', total: 597.00 }
];

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/products', (req, res) => {
  res.json(products);
});

app.get('/users', (req, res) => {
  res.json(users);
});

app.get('/orders', (req, res) => {
  res.json(orders);
});

app.listen(PORT, () => {
  console.log(`GateShield backend service running on port ${PORT}`);
});
