const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const moment = require('moment');
const { pool } = require('../config/db');
const { isAuthenticated, isOperator, isSupervisor } = require('../middlewares/auth');
const { calculateSalaryForMonth } = require('../helpers/salaryCalculator');
const { validateAttendanceFilename } = require('../helpers/attendanceFilenameValidator');

// Configure upload for JSON files in memory
const upload = multer({ storage: multer.memoryStorage() });

// GET form to upload attendance JSON
router.get('/salary/upload', isAuthenticated, isOperator, (req, res) => {
  res.redirect('/operator/departments');
});

// POST process uploaded attendance JSON
router.post('/salary/upload', isAuthenticated, isOperator, upload.single('attFile'), async (req, res) => {
  const file = req.file;
  if (!file) {
    req.flash('error', 'No file uploaded');
    return res.redirect('/operator/departments');
  }

  const validation = await validateAttendanceFilename(file.originalname);
  if (!validation.valid) {
    req.flash('error', validation.message);
    return res.redirect('/operator/departments');
  }

  let data;
  try {
    const jsonStr = file.buffer.toString('utf8');
    data = JSON.parse(jsonStr);
  } catch (err) {
    console.error('Failed to parse JSON:', err);
    req.flash('error', 'Invalid JSON');
    return res.redirect('/operator/departments');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const emp of data) {
      const [empRows] = await conn.query('SELECT id, salary, salary_type FROM employees WHERE punching_id = ? AND name = ? LIMIT 1', [emp.punchingId, emp.name]);
      if (!empRows.length) continue;
      const employee = empRows[0];
      for (const att of emp.attendance) {
        await conn.query(
          `INSERT INTO employee_attendance (employee_id, date, punch_in, punch_out, status)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE punch_in = VALUES(punch_in), punch_out = VALUES(punch_out), status = VALUES(status)`,
          [employee.id, att.date, att.punchIn || null, att.punchOut || null, att.status || 'present']
        );
      }
      const month = moment(data[0].attendance[0].date).format('YYYY-MM');
      await calculateSalaryForMonth(conn, employee.id, month);
    }
    await conn.commit();
    req.flash('success', 'Attendance uploaded');
  } catch (err) {
    await conn.rollback();
    console.error('Error processing attendance:', err);
    req.flash('error', 'Failed to process attendance');
  } finally {
    conn.release();
  }

  res.redirect('/operator/departments');
});

// View salary summary for operator
router.get('/salaries', isAuthenticated, isOperator, (req, res) => {
  res.redirect('/operator/departments');
});

// View salary summary for operator
router.get('/salaries', isAuthenticated, isOperator, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.name AS supervisor_name, u.id AS supervisor_id,
             COUNT(e.id) AS employee_count,
             SUM(CASE WHEN e.is_active = 1 THEN e.salary ELSE 0 END) AS total_salary
        FROM users u
        JOIN employees e ON e.supervisor_id = u.id
       GROUP BY u.id`);
    res.render('operatorSalaries', { user: req.session.user, summary: rows });
  } catch (err) {
    console.error('Error loading salary summary:', err);
    req.flash('error', 'Could not load salary summary');
    res.redirect('/dashboard');
  }

});

// Supervisor view of employee salary
router.get('/employees/:id/salary', isAuthenticated, isSupervisor, async (req, res) => {
  const empId = req.params.id;
  const month = req.query.month || moment().format('YYYY-MM');
  try {
    const [[emp]] = await pool.query('SELECT * FROM employees WHERE id = ? AND supervisor_id = ?', [empId, req.session.user.id]);
    if (!emp) {
      req.flash('error', 'Employee not found');
      return res.redirect('/supervisor/employees');
    }
    const [attendance] = await pool.query('SELECT * FROM employee_attendance WHERE employee_id = ? AND DATE_FORMAT(date, "%Y-%m") = ? ORDER BY date', [empId, month]);
    const [[salary]] = await pool.query('SELECT * FROM employee_salaries WHERE employee_id = ? AND month = ? LIMIT 1', [empId, month]);
    res.render('employeeSalary', { user: req.session.user, employee: emp, attendance, salary, month });
  } catch (err) {
    console.error('Error loading salary view:', err);
    req.flash('error', 'Failed to load salary');
    res.redirect('/supervisor/employees');
  }
});

module.exports = router;
