# kotty-track


## Inventory Management

Create the following tables for the store employee dashboard:

```sql
CREATE TABLE goods_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  description_of_goods VARCHAR(255) NOT NULL,
  size VARCHAR(50) NOT NULL,
  unit ENUM('PCS','ROLL') NOT NULL,
  qty INT NOT NULL DEFAULT 0
);

INSERT INTO goods_inventory (description_of_goods, size, unit)
VALUES
  ('FLIPKART POLYBAG', '10*13', 'PCS'),
  ('FLIPKART POLYBAG', '12.5*14', 'PCS'),
  ('FLIPKART POLYBAG', '16*20', 'PCS'),
  ('MYNTRA PAPER BAG', '13*15', 'PCS'),
  ('MYNTRA PAPER BAG', '15*18', 'PCS'),
  ('MYNTRA PAPER BAG', '17*21', 'PCS'),
  ('NYKAA PAPER BAG', '13*15', 'PCS'),
  ('NYKAA PAPER BAG', '10*12', 'PCS'),
  ('TRANPARENT POLYBAG', '8*9*2', 'PCS'),
  ('TRANPARENT POLYBAG', '10*12*2', 'PCS'),
  ('TRANPARENT POLYBAG', '12*13*2', 'PCS'),
  ('TRANPARENT POLYBAG', '11*14*2', 'PCS'),
  ('TRANPARENT POLYBAG', '12*16*2', 'PCS'),
  ('TRANPARENT POLYBAG', '14*24*2', 'PCS'),
  ('AMAZON POLYBAG NP6', '10*14', 'PCS'),
  ('AMAZON POLYBAG NP7', '12*16', 'PCS'),
  ('AMAZON PLAIN POLYBAG NP6', '10*14', 'PCS'),
  ('AMAZON PLAIN POLYBAG NP7', '12*16', 'PCS'),
  ('AJIO POLYBAG', '10*14', 'PCS'),
  ('AJIO POLYBAG', '12*16', 'PCS'),
  ('AJIO POLYBAG', '16*20', 'PCS'),
  ('BARCODE ROLL', '38*50', 'ROLL'),
  ('BARCODE ROLL', '75*50', 'ROLL'),
  ('WATER MARK 3*5', '75*125', 'ROLL'),
  ('BARCODE ROLL', '100*150', 'ROLL'),
  ('RIBBON', '80*300', 'ROLL'),
  ('RIBBON', '40*225', 'ROLL'),
  ('TAFTA ROLL', '', 'ROLL');

CREATE TABLE incoming_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goods_id INT NOT NULL,
  quantity INT NOT NULL,
  added_by INT NOT NULL,
  remark VARCHAR(255),
  added_at DATETIME NOT NULL,
  FOREIGN KEY (goods_id) REFERENCES goods_inventory(id)
);

CREATE TABLE dispatched_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goods_id INT NOT NULL,
  quantity INT NOT NULL,
  remark VARCHAR(255),
  dispatched_by INT NOT NULL,
  dispatched_at DATETIME NOT NULL,
  FOREIGN KEY (goods_id) REFERENCES goods_inventory(id)
);
```

`incoming_data` stores every addition with timestamp and user while `dispatched_data` tracks quantity sent out along with remarks.

Create a `store_admin` role in the `roles` table to allow managing the list of goods. Users with this role can add new items (description, size and unit) from the Store Admin dashboard. Newly created items automatically appear in the store inventory pages.

## Department & Supervisor Tables

Use the following tables to manage departments and the supervisors assigned to them:

```sql
CREATE TABLE departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE department_supervisors (
  department_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (department_id, user_id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Operators can create departments and assign `supervisor` users to them from the Department Management screen.


## Supervisor Employees

To let supervisors manage their own employees, create the following table:

```sql
CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supervisor_id INT NOT NULL,
  punching_id VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  salary DECIMAL(10,2) NOT NULL,
  salary_type ENUM('dihadi', 'monthly') NOT NULL,
  date_of_joining DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (supervisor_id) REFERENCES users(id)
);
```

Each supervisor can add, view and activate/deactivate only the employees that belong to them.


## Employee Leaves

Supervisors can track leaves for their employees using this table:

```sql
CREATE TABLE employee_leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_date DATE NOT NULL,
  days DECIMAL(4,2) NOT NULL,
  remark VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

Employees earn 1.5 days of leave after completing three months of service. From the fourth month onward they accrue 1.5 days each month. The available balance is the accrued amount minus any rows stored in `employee_leaves`.

## Employee Debits & Advances

Supervisors may record financial debits or advances for their employees. Use separate tables linked to the employee:

```sql
CREATE TABLE employee_debits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255),
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE employee_advances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255),
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

Debits represent losses caused by the employee, while advances are company funds lent to the employee. Supervisors can add entries for any of their own employees.

## Attendance & Salary

Add tables to track daily attendance and calculate monthly salaries:

```sql
CREATE TABLE employee_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  punch_in TIME,
  punch_out TIME,
  status ENUM('present','absent','one punch only') DEFAULT 'present',
  UNIQUE KEY unique_att (employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE employee_salaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  month CHAR(7) NOT NULL, -- YYYY-MM
  gross DECIMAL(10,2) NOT NULL,
  deduction DECIMAL(10,2) NOT NULL,
  net DECIMAL(10,2) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY unique_salary (employee_id, month),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

Update the `employees` table to store each worker's allotted hours per day:

```sql
ALTER TABLE employees ADD COLUMN allotted_hours DECIMAL(4,2) NOT NULL DEFAULT 0;
```

Operators can upload JSON attendance files. After upload each employee's punches
are stored in `employee_attendance` and a monthly record is calculated in

`employee_salaries`. These actions are available from the operator dashboard,
which also lists each supervisor with their active employee count and total

`employee_salaries`.

A summary page lists each supervisor with their active employee count and total

monthly salary.
