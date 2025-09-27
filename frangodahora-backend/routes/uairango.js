const express = require('express');
const router = express.Router();
const uairangoService = require('../uairango-service');

// Rota para forçar a verificação de novos pedidos do UaiRango sob demanda
router.post('/check', (req, res) => {
    console.log('[API Trigger] Verificação de pedidos UaiRango solicitada pelo frontend.');
    
    // Aciona a verificação sem esperar ela terminar (fire-and-forget)
    // Isso garante que a interface do usuário não fique travada esperando.
    uairangoService.checkForNewOrders(); 
    
    // Responde imediatamente ao frontend que a solicitação foi aceita.
    res.status(202).json({ message: 'Verificação de novos pedidos foi iniciada.' });
});

module.exports = router;
