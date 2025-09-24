const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db'); // MUDANÇA: Importa a função de inicialização

// Importa os arquivos de rotas
const pedidosRoutes = require('./routes/pedidos');
const motoqueirosRoutes = require('./routes/motoqueiros');
const estoqueRoutes = require('./routes/estoque');
const configuracoesRoutes = require('./routes/configuracoes');
const authRoutes = require('./routes/auth');
const uairangoService = require('./uairango-service');

const app = express();

app.use(cors());
app.use(express.json());

// --- SERVINDO ARQUIVOS DO FRONTEND ---
const frontendPath = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));


// === DELEGAÇÃO DAS ROTAS DA API ===
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/motoqueiros', motoqueirosRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/auth', authRoutes);

// Rota principal da API (opcional)
app.get('/api', (req, res) => {
  res.send('API da Frangolândia no ar! 🐔🔥');
});

const PORT = 3000;

// MUDANÇA: Inicializa o banco de dados ANTES de iniciar o servidor
initializeDatabase((err) => {
    if (err) {
        console.error("Falha ao inicializar o banco de dados. O servidor não será iniciado.", err);
        process.exit(1); // Encerra o processo se o DB falhar
    }

    // O banco de dados está pronto, agora podemos iniciar o servidor e os serviços
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
      
      // Inicia o serviço de busca de pedidos do UaiRango
      uairangoService.startPolling(1);
    });
});
