const express = require('express');
const cors = require('cors');
const path = require('path'); // Importa o módulo 'path'
const db = require('./db'); 

// Importa os arquivos de rotas
const pedidosRoutes = require('./routes/pedidos');
const motoqueirosRoutes = require('./routes/motoqueiros');
const estoqueRoutes = require('./routes/estoque');
const configuracoesRoutes = require('./routes/configuracoes');

const app = express();

app.use(cors());
app.use(express.json());

// --- SERVINDO ARQUIVOS DO FRONTEND (MÉTODO MAIS ROBUSTO) ---
// Usa path.resolve para criar um caminho absoluto para a pasta frontend
const frontendPath = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));


// === DELEGAÇÃO DAS ROTAS DA API ===
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/motoqueiros', motoqueirosRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/configuracoes', configuracoesRoutes);

// Rota principal da API (opcional)
app.get('/api', (req, res) => {
  res.send('API da Frangolândia no ar! 🐔🔥');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
