const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db'); 

// Importa os arquivos de rotas
const pedidosRoutes = require('./routes/pedidos');
const motoqueirosRoutes = require('./routes/motoqueiros');
const estoqueRoutes = require('./routes/estoque');
const configuracoesRoutes = require('./routes/configuracoes');
const authRoutes = require('./routes/auth');
const uairangoRoutes = require('./routes/uairango'); 
const uairangoService = require('./uairango-service');
const sseService = require('./sse-service');

const app = express();

app.use(cors());
app.use(express.json());

// --- SERVINDO ARQUIVOS DO FRONTEND ---
const frontendPath = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// === ROTA PARA SERVER-SENT EVENTS (SSE) ===
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders(); 

    sseService.addClient(res);

    res.write('data: {"type": "connected"}\n\n');

    req.on('close', () => {
        sseService.removeClient(res);
    });
});


// === DELEGAÇÃO DAS ROTAS DA API ===
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/motoqueiros', motoqueirosRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/uairango', uairangoRoutes);

// Rota principal da API (opcional)
app.get('/api', (req, res) => {
  res.send('API da Frangolândia no ar! 🐔🔥');
});

const PORT = 3000;

initializeDatabase((err) => {
    if (err) {
        console.error("Falha ao inicializar o banco de dados. O servidor não será iniciado.", err);
        process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
      // ATUALIZADO: O valor 1 (minuto) foi alterado para 0.33 (~20 segundos)
      uairangoService.startPolling(0.33); 
    });
});

