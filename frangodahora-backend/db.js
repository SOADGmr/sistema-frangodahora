const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database', 'bancodedados.db');

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

    db.run(`
        CREATE TABLE IF NOT EXISTS taxas_bairro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bairro TEXT NOT NULL UNIQUE,
            taxa REAL NOT NULL
        )
    `);

    console.log("Tabelas criadas ou já existentes com sucesso.");
  });
}

module.exports = db;
