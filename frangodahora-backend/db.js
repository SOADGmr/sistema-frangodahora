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
    console.error('Erro CRÍTICO ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite com sucesso.');
  }
});

function initializeDatabase(callback) {
    db.serialize(() => {
        console.log("Verificando e criando tabelas...");

        // Garante que todas as tabelas existam
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL UNIQUE, senha TEXT NOT NULL, cargo TEXT NOT NULL CHECK(cargo IN ('Admin', 'Moto')))`);
        db.run(`CREATE TABLE IF NOT EXISTS motoqueiros (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE)`);
        db.run(`CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_nome TEXT, cliente_endereco TEXT, cliente_bairro TEXT, cliente_referencia TEXT, cliente_telefone TEXT, quantidade_frangos INTEGER NOT NULL, meio_frango INTEGER DEFAULT 0, taxa_entrega REAL DEFAULT 0, preco_total REAL, forma_pagamento TEXT, canal_venda TEXT, status TEXT DEFAULT 'Pendente', horario_pedido DATETIME DEFAULT CURRENT_TIMESTAMP, motoqueiro_id INTEGER, rota_ordem INTEGER DEFAULT 0, picado INTEGER DEFAULT 0, observacao TEXT, tempo_previsto INTEGER, FOREIGN KEY(motoqueiro_id) REFERENCES motoqueiros(id))`);
        db.run(`CREATE TABLE IF NOT EXISTS operacoes_diarias (id INTEGER PRIMARY KEY AUTOINCREMENT, motoqueiro_id INTEGER NOT NULL, data TEXT NOT NULL, frangos_na_bag REAL DEFAULT 0, FOREIGN KEY(motoqueiro_id) REFERENCES motoqueiros(id), UNIQUE(motoqueiro_id, data))`);
        db.run(`CREATE TABLE IF NOT EXISTS estoque (data TEXT PRIMARY KEY, quantidade_inicial REAL NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY NOT NULL, valor TEXT NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS taxas_bairro (id INTEGER PRIMARY KEY AUTOINCREMENT, bairro TEXT NOT NULL UNIQUE, taxa REAL NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS uairango_estabelecimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, id_estabelecimento INTEGER NOT NULL UNIQUE, token_developer TEXT NOT NULL, nome_estabelecimento TEXT, ativo INTEGER DEFAULT 1)`);

        // Passo 1: Adiciona a coluna, se não existir, sem a restrição UNIQUE
        db.run("ALTER TABLE pedidos ADD COLUMN uairango_id_pedido TEXT", (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error("Erro ao adicionar coluna 'uairango_id_pedido':", err.message);
                return; 
            }
            
            // Passo 2: Cria o índice único na coluna. 'IF NOT EXISTS' torna a operação segura.
            db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_uairango_id ON pedidos(uairango_id_pedido)", (indexErr) => {
                if(indexErr) {
                    console.error("Erro ao criar índice único para 'uairango_id_pedido':", indexErr.message);
                    return;
                }
                
                console.log("Coluna e índice 'uairango_id_pedido' verificados/criados com sucesso.");

                // Agora, com o schema 100% correto, insere os dados padrão
                const saltRounds = 10;
                const adminPassword = 'admin123';
                bcrypt.hash(adminPassword, saltRounds, (hashErr, hash) => {
                    if (hashErr) { return console.error("Erro ao gerar hash da senha:", hashErr); }
                    db.run(`INSERT OR IGNORE INTO usuarios (id, usuario, senha, cargo) VALUES (1, ?, ?, ?)`, ['admin', hash, 'Admin']);
                });
                db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('preco_frango', '50.00')`);
                db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('tempo_entrega', '60')`);
                db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('tempo_retirada', '30')`);

                console.log("Banco de dados pronto para uso.");
                if (callback) callback();
            });
        });
    });
}

module.exports = { db, initializeDatabase };

