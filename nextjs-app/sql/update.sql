-- 更新 daily_stats 表，增加净佣金字段
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS net_income NUMERIC(10,2) DEFAULT 0;

-- 创建消耗表
CREATE TABLE IF NOT EXISTS daily_costs (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  date DATE NOT NULL,
  cost NUMERIC(10,2) DEFAULT 0,
  UNIQUE(account_name, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_costs_account ON daily_costs(account_name);
CREATE INDEX IF NOT EXISTS idx_daily_costs_date ON daily_costs(date);
