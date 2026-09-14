CREATE DATABASE IF NOT EXISTS impression CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE impression;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS inventory_lines;
DROP TABLE IF EXISTS stock_alerts;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS supply_lines;
DROP TABLE IF EXISTS supplies;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS order_amendments;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS product_options;
DROP TABLE IF EXISTS product_materials;
DROP TABLE IF EXISTS price_tiers;
DROP TABLE IF EXISTS catalogue_products;
DROP TABLE IF EXISTS catalogue_families;
DROP TABLE IF EXISTS document_templates;
DROP TABLE IF EXISTS client_contacts;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS client_sectors;
DROP TABLE IF EXISTS materials;
DROP TABLE IF EXISTS material_types;
DROP TABLE IF EXISTS material_units;
DROP TABLE IF EXISTS workstations;
DROP TABLE IF EXISTS workshops;
DROP TABLE IF EXISTS taxes;
DROP TABLE IF EXISTS currencies;
DROP TABLE IF EXISTS company_settings;
DROP TABLE IF EXISTS data_backups;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS companies;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE companies (
  id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  email VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_company_name (company_id, name),
  CONSTRAINT fk_roles_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_id CHAR(36) NOT NULL,
  module_id VARCHAR(64) NOT NULL,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_read TINYINT(1) NOT NULL DEFAULT 0,
  can_update TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, module_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(64) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  is_company_owner TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_company_email (company_id, email),
  UNIQUE KEY uq_users_company_reference (company_id, reference),
  KEY idx_users_email (email),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_attempts_email_time (email, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  module_id VARCHAR(64) NOT NULL DEFAULT '',
  feature_id VARCHAR(64) NOT NULL DEFAULT '',
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL DEFAULT '',
  entity_id VARCHAR(64) NOT NULL DEFAULT '',
  detail TEXT NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_company_created (company_id, created_at),
  KEY idx_audit_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_settings (
  company_id CHAR(36) NOT NULL,
  trade_name VARCHAR(190) NOT NULL DEFAULT '',
  legal_name VARCHAR(190) NOT NULL DEFAULT '',
  legal_form VARCHAR(64) NOT NULL DEFAULT '',
  ninea VARCHAR(64) NOT NULL DEFAULT '',
  rccm VARCHAR(64) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  country VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  website VARCHAR(190) NOT NULL DEFAULT '',
  iban VARCHAR(120) NOT NULL DEFAULT '',
  bank VARCHAR(190) NOT NULL DEFAULT '',
  logo MEDIUMTEXT NULL,
  work_days VARCHAR(120) NOT NULL DEFAULT '',
  opening_hours VARCHAR(120) NOT NULL DEFAULT '',
  paper_unit VARCHAR(190) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id),
  CONSTRAINT fk_settings_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE currencies (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  label VARCHAR(80) NOT NULL,
  symbol VARCHAR(16) NOT NULL DEFAULT '',
  decimals TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_currencies_company (company_id),
  CONSTRAINT fk_currencies_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE taxes (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  label VARCHAR(120) NOT NULL,
  rate DECIMAL(8,3) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  code VARCHAR(32) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_taxes_company (company_id),
  CONSTRAINT fk_taxes_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workshops (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workshops_company_name (company_id, name),
  CONSTRAINT fk_workshops_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workstations (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  workshop_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  cadence VARCHAR(190) NOT NULL DEFAULT '',
  hourly_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  capacity DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workstations_ref (company_id, reference),
  KEY idx_workstations_workshop (workshop_id),
  CONSTRAINT fk_workstations_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_workstations_workshop FOREIGN KEY (workshop_id) REFERENCES workshops (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_types (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_material_types_name (company_id, name),
  CONSTRAINT fk_material_types_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_units (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_material_units_name (company_id, name),
  CONSTRAINT fk_material_units_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE materials (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  type_id CHAR(36) NOT NULL,
  unit_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Rupture',
  buy_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  sell_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  alert_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_materials_ref (company_id, reference),
  KEY idx_materials_type (type_id),
  KEY idx_materials_unit (unit_id),
  CONSTRAINT fk_materials_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_materials_type FOREIGN KEY (type_id) REFERENCES material_types (id),
  CONSTRAINT fk_materials_unit FOREIGN KEY (unit_id) REFERENCES material_units (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE catalogue_families (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalogue_families_name (company_id, name),
  CONSTRAINT fk_catalogue_families_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE catalogue_products (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  family_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  product_kind VARCHAR(32) NOT NULL DEFAULT 'Produit',
  designation VARCHAR(255) NOT NULL DEFAULT '',
  base_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  min_quantity DECIMAL(14,3) NOT NULL DEFAULT 1,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit VARCHAR(32) NOT NULL DEFAULT 'u',
  alert_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalogue_ref (company_id, reference),
  KEY idx_catalogue_family (family_id),
  CONSTRAINT fk_catalogue_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_catalogue_family FOREIGN KEY (family_id) REFERENCES catalogue_families (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_materials (
  id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  material_id CHAR(36) NULL,
  label VARCHAR(190) NOT NULL,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit VARCHAR(64) NOT NULL DEFAULT 'u',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_product_materials_product (product_id),
  CONSTRAINT fk_product_materials_product FOREIGN KEY (product_id) REFERENCES catalogue_products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_options (
  id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  label VARCHAR(190) NOT NULL,
  price DECIMAL(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_product_options_product (product_id, kind),
  CONSTRAINT fk_product_options_product FOREIGN KEY (product_id) REFERENCES catalogue_products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE price_tiers (
  id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_price_tiers_product (product_id),
  CONSTRAINT fk_price_tiers_product FOREIGN KEY (product_id) REFERENCES catalogue_products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE data_backups (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  frequency VARCHAR(64) NOT NULL DEFAULT 'Manuelle',
  size VARCHAR(32) NOT NULL DEFAULT '',
  location VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'Réussie',
  last_run DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_data_backups_ref (company_id, reference),
  KEY idx_data_backups_company_run (company_id, last_run),
  CONSTRAINT fk_data_backups_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE client_sectors (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_sectors_name (company_id, name),
  CONSTRAINT fk_client_sectors_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clients (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  client_type VARCHAR(32) NOT NULL DEFAULT 'Entreprise',
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  sector VARCHAR(120) NOT NULL DEFAULT '',
  legal_name VARCHAR(190) NOT NULL DEFAULT '',
  legal_form VARCHAR(64) NOT NULL DEFAULT '',
  ninea VARCHAR(64) NOT NULL DEFAULT '',
  rccm VARCHAR(64) NOT NULL DEFAULT '',
  contact VARCHAR(190) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  website VARCHAR(255) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  country VARCHAR(120) NOT NULL DEFAULT 'Sénégal',
  discount DECIMAL(8,3) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_ref (company_id, reference),
  KEY idx_clients_type (company_id, client_type),
  KEY idx_clients_sector (company_id, sector),
  CONSTRAINT fk_clients_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE client_contacts (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  role VARCHAR(120) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_contacts_ref (company_id, reference),
  KEY idx_client_contacts_client (client_id),
  CONSTRAINT fk_client_contacts_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_client_contacts_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE document_templates (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Brouillon',
  layout_json LONGTEXT NULL,
  html LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_document_templates_ref (company_id, reference),
  CONSTRAINT fk_document_templates_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotes (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL,
  client_id CHAR(36) NOT NULL,
  apply_discount TINYINT(1) NOT NULL DEFAULT 0,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  option_a VARCHAR(255) NOT NULL DEFAULT '',
  option_b VARCHAR(255) NOT NULL DEFAULT '',
  option_c VARCHAR(255) NOT NULL DEFAULT '',
  payload JSON NOT NULL,
  order_id CHAR(36) NULL,
  order_ref VARCHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quotes_ref (company_id, reference),
  KEY idx_quotes_kind (company_id, kind, updated_at),
  KEY idx_quotes_client (company_id, client_id),
  KEY idx_quotes_status (company_id, status),
  CONSTRAINT fk_quotes_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_quotes_client FOREIGN KEY (client_id) REFERENCES clients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'En attente',
  client_id CHAR(36) NOT NULL,
  quote_id CHAR(36) NULL,
  quote_ref VARCHAR(32) NOT NULL DEFAULT '',
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  payload JSON NOT NULL,
  history_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_ref (company_id, reference),
  UNIQUE KEY uq_orders_quote (quote_id),
  KEY idx_orders_client (company_id, client_id),
  KEY idx_orders_status (company_id, status),
  CONSTRAINT fk_orders_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_client FOREIGN KEY (client_id) REFERENCES clients (id),
  CONSTRAINT fk_orders_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_amendments (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Validé',
  reason VARCHAR(400) NOT NULL,
  delta DECIMAL(14,2) NOT NULL DEFAULT 0,
  previous_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  new_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  previous_snapshot JSON NULL,
  next_snapshot JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_amendments_ref (company_id, reference),
  KEY idx_order_amendments_order (order_id),
  CONSTRAINT fk_order_amendments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_amendments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoices (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL,
  settlement VARCHAR(16) NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  remaining DECIMAL(14,2) NOT NULL DEFAULT 0,
  issued_at DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_ref (company_id, reference),
  KEY idx_invoices_order (company_id, order_id),
  KEY idx_invoices_issued (company_id, issued_at),
  CONSTRAINT fk_invoices_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_deposits (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Ouvert',
  asked DECIMAL(14,2) NOT NULL DEFAULT 0,
  received DECIMAL(14,2) NOT NULL DEFAULT 0,
  remaining DECIMAL(14,2) NOT NULL DEFAULT 0,
  payments JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_deposits_order (order_id),
  UNIQUE KEY uq_order_deposits_ref (company_id, reference),
  KEY idx_order_deposits_company (company_id, updated_at),
  CONSTRAINT fk_order_deposits_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_deposits_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_files (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Reçu',
  format VARCHAR(16) NOT NULL DEFAULT 'Fichier',
  version INT NOT NULL DEFAULT 1,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  `stored` TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_files_ref (company_id, reference),
  KEY idx_order_files_order (company_id, order_id),
  CONSTRAINT fk_order_files_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_files_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE machine_slots (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  workstation_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Planifié',
  day DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_machine_slots_ref (company_id, reference),
  KEY idx_machine_slots_day (company_id, workstation_id, day),
  CONSTRAINT fk_machine_slots_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_machine_slots_workstation FOREIGN KEY (workstation_id) REFERENCES workstations (id) ON DELETE CASCADE,
  CONSTRAINT fk_machine_slots_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suppliers (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Actif',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_ref (company_id, reference),
  KEY idx_suppliers_company (company_id, updated_at),
  CONSTRAINT fk_suppliers_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplies (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  reference VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Validé',
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  issued_at DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplies_ref (company_id, reference),
  KEY idx_supplies_supplier (company_id, supplier_id, issued_at),
  CONSTRAINT fk_supplies_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_supplies_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supply_lines (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  supply_id CHAR(36) NOT NULL,
  material_id CHAR(36) NOT NULL,
  label VARCHAR(190) NOT NULL,
  unit VARCHAR(64) NOT NULL DEFAULT '',
  qty_init DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty_appro DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty_solde DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  sell_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_supply_lines_supply (supply_id, sort_order),
  KEY idx_supply_lines_material (material_id),
  CONSTRAINT fk_supply_lines_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_supply_lines_supply FOREIGN KEY (supply_id) REFERENCES supplies (id) ON DELETE CASCADE,
  CONSTRAINT fk_supply_lines_material FOREIGN KEY (material_id) REFERENCES materials (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_movements (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  article_kind VARCHAR(16) NOT NULL,
  article_id CHAR(36) NOT NULL,
  article_name VARCHAR(190) NOT NULL,
  article_reference VARCHAR(64) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  qty_init DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty_out DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty_solde DECIMAL(14,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_movements_company (company_id, created_at),
  KEY idx_stock_movements_article (company_id, article_kind, article_id),
  CONSTRAINT fk_stock_movements_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_alerts (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  article_kind VARCHAR(16) NOT NULL,
  article_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'OK',
  minimum DECIMAL(14,3) NOT NULL DEFAULT 0,
  current_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  supplier VARCHAR(190) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_alerts_article (company_id, article_kind, article_id),
  UNIQUE KEY uq_stock_alerts_ref (company_id, reference),
  KEY idx_stock_alerts_company (company_id, updated_at),
  CONSTRAINT fk_stock_alerts_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_lines (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  article_kind VARCHAR(16) NOT NULL,
  article_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'En cours',
  system_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  physical_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  gap DECIMAL(14,3) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  qty_init DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty_solde DECIMAL(14,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_ref (company_id, reference),
  KEY idx_inventory_article (company_id, article_kind, article_id, status),
  KEY idx_inventory_company (company_id, updated_at),
  CONSTRAINT fk_inventory_lines_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

