const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'database', 'frangodahora.db');

const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite com sucesso.');
    criarTabelas();
  }
});

function criarTabelas() {
  db.serialize(() => {
    console.log("Verificando e criando tabelas...");

    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        cargo TEXT NOT NULL CHECK(cargo IN ('Admin', 'Moto'))
      )
    `);

    const saltRounds = 10;
    const adminPassword = 'admin123';
    bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
        if (err) {
            console.error("Erro ao gerar hash da senha:", err);
            return;
        }
        db.run(`INSERT OR IGNORE INTO usuarios (usuario, senha, cargo) VALUES (?, ?, ?)`, ['admin', hash, 'Admin']);
    });

    // --- ESTRUTURA DA TABELA COM A COLUNA 'rota_ordem' ---
    db.run(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_nome TEXT,
        cliente_endereco TEXT,
        cliente_bairro TEXT,
        cliente_referencia TEXT,
        cliente_telefone TEXT,
        quantidade_frangos INTEGER NOT NULL,
        meio_frango INTEGER DEFAULT 0,
        taxa_entrega REAL DEFAULT 0,
        preco_total REAL,
        forma_pagamento TEXT CHECK(forma_pagamento IN ('Dinheiro', 'Pix', 'Cartão', 'Pago')),
        canal_venda TEXT CHECK(canal_venda IN ('Porta', 'UaiRango', 'Telefone')),
        status TEXT DEFAULT 'Pendente' CHECK(status IN ('Pendente', 'Em Rota', 'Entregue', 'Cancelado')),
        horario_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
        motoqueiro_id INTEGER,
        rota_ordem INTEGER DEFAULT 0,
        picado INTEGER DEFAULT 0,
        observacao TEXT,
        tempo_previsto INTEGER,
        FOREIGN KEY(motoqueiro_id) REFERENCES motoqueiros(id)
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS motoqueiros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS operacoes_diarias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motoqueiro_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        frangos_na_bag REAL DEFAULT 0,
        FOREIGN KEY(motoqueiro_id) REFERENCES motoqueiros(id),
        UNIQUE(motoqueiro_id, data)
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS estoque (
        data TEXT PRIMARY KEY,
        quantidade_inicial REAL NOT NULL
      )
    `);
    
    db.run(`CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY NOT NULL, valor TEXT NOT NULL)`);
    
    db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('preco_frango', '50.00')`);
    db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('tempo_entrega', '60')`);
    db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('tempo_retirada', '30')`);

    db.run(`
        CREATE TABLE IF NOT EXISTS taxas_bairro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bairro TEXT NOT NULL UNIQUE,
            taxa REAL NOT NULL
        )
    `);

    console.log("Tabelas verificadas/criadas com sucesso.");
  });
}

module.exports = db;
