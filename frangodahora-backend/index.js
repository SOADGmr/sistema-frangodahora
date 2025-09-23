const express = require('express');
const cors = require('cors');
const path = require('path');
// ATUALIZADO: Importa o db e a função de inicialização
const { initializeDatabase } = require('./db'); 

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

// Função que inicia o servidor e os serviços
function startApp() {
  // === DELEGAÇÃO DAS ROTAS DA API ===
  // As rotas só são configuradas DEPOIS que o DB está pronto
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
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    
    // Inicia o serviço do UaiRango SÓ DEPOIS que tudo está configurado
    uairangoService.startPolling(1);
  });
}

// ATUALIZADO: Chama a inicialização do DB e passa a função startApp como callback
initializeDatabase(startApp);
