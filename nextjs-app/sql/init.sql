-- 账号基础信息表
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  operator TEXT DEFAULT '',
  account_type TEXT DEFAULT '混剪',
  buyer TEXT DEFAULT '',
  status TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每日订单统计表
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  date DATE NOT NULL,
  orders INTEGER DEFAULT 0,
  income NUMERIC(10,2) DEFAULT 0,
  amount NUMERIC(10,2) DEFAULT 0,
  UNIQUE(account_name, date)
);

-- 上传记录表
CREATE TABLE IF NOT EXISTS uploads (
  id SERIAL PRIMARY KEY,
  filename TEXT,
  account_count INTEGER,
  date_from DATE,
  date_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_daily_stats_account ON daily_stats(account_name);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
