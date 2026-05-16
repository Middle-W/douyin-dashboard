-- ==========================================
-- 抖音数据看板 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行
-- ==========================================

-- 账号基础信息表
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  operator TEXT DEFAULT '',
  account_type TEXT DEFAULT '混剪',
  buyer TEXT DEFAULT '',
  status TEXT DEFAULT '',
  code TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自定义字段配置表
CREATE TABLE IF NOT EXISTS account_fields (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  show_in_admin BOOLEAN DEFAULT true,
  show_in_dashboard BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
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
  net_income NUMERIC(10,2) DEFAULT 0,
  UNIQUE(account_name, date)
);

-- 每日消耗表
CREATE TABLE IF NOT EXISTS daily_costs (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  date DATE NOT NULL,
  cost NUMERIC(10,2) DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_daily_costs_account ON daily_costs(account_name);
CREATE INDEX IF NOT EXISTS idx_daily_costs_date ON daily_costs(date);
