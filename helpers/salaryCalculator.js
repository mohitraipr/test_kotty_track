const moment = require('moment');

async function calculateSalaryForMonth(conn, employeeId, month) {
  const [[emp]] = await conn.query('SELECT salary, salary_type FROM employees WHERE id = ?', [employeeId]);
  if (!emp) return;
  const [attendance] = await conn.query(
    'SELECT status FROM employee_attendance WHERE employee_id = ? AND DATE_FORMAT(date, "%Y-%m") = ?',
    [employeeId, month]
  );
  const daysInMonth = moment(month + '-01').daysInMonth();
  const dailyRate = parseFloat(emp.salary) / daysInMonth;
  let absent = 0;
  attendance.forEach(a => {
    if (a.status === 'absent' || a.status === 'one punch only') absent++;
  });
  const gross = parseFloat(emp.salary);
  const deduction = absent * dailyRate;
  const net = gross - deduction;
  await conn.query(
    `INSERT INTO employee_salaries (employee_id, month, gross, deduction, net, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE gross=VALUES(gross), deduction=VALUES(deduction), net=VALUES(net)`,
    [employeeId, month, gross, deduction, net]
  );
}

module.exports = { calculateSalaryForMonth };
