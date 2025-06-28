const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { isAuthenticated, isOperator } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');
const moment = require('moment');
const { calculateSalaryForMonth } = require('../helpers/salaryCalculator');
const { validateAttendanceFilename } = require('../helpers/attendanceFilenameValidator');

const upload = multer({ storage: multer.memoryStorage() });

// GET /operator/departments - list departments and supervisors
router.get('/departments', isAuthenticated, isOperator, async (req, res) => {
  try {
    const showSalary = true;
    const [deptRows] = await pool.query(
      `SELECT d.id, d.name,
              GROUP_CONCAT(u.username ORDER BY u.username SEPARATOR ', ') AS supervisors
         FROM departments d
         LEFT JOIN department_supervisors ds ON d.id = ds.department_id
         LEFT JOIN users u ON ds.user_id = u.id
         GROUP BY d.id
         ORDER BY d.name`
    );

    const [supervisors] = await pool.query(
      `SELECT u.id, u.username
         FROM users u
         JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'supervisor' AND u.is_active = 1
        ORDER BY u.username`
    );

    let salarySummary = [];
    if (showSalary) {
      const [rows] = await pool.query(`
        SELECT u.name AS supervisor_name, u.id AS supervisor_id,
               COUNT(e.id) AS employee_count,
               SUM(CASE WHEN e.is_active = 1 THEN e.salary ELSE 0 END) AS total_salary
          FROM users u
          JOIN employees e ON e.supervisor_id = u.id
         GROUP BY u.id`);
      salarySummary = rows;
    }

    res.render('operatorDepartments', {
      user: req.session.user,
      departments: deptRows,
      supervisors,
      showSalarySection: showSalary,
      salarySummary
    });
  } catch (err) {
    console.error('Error loading departments:', err);
    req.flash('error', 'Failed to load departments');
    res.redirect('/operator/dashboard');
  }
});

// POST /operator/departments - create a department
router.post('/departments', isAuthenticated, isOperator, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    req.flash('error', 'Department name required');
    return res.redirect('/operator/departments');
  }
  try {
    await pool.query('INSERT INTO departments (name) VALUES (?)', [name]);
    req.flash('success', 'Department created');
    res.redirect('/operator/departments');
  } catch (err) {
    console.error('Error creating department:', err);
    req.flash('error', 'Error creating department');
    res.redirect('/operator/departments');
  }
});

// POST /operator/departments/:id/assign - assign supervisor to department
router.post('/departments/:id/assign', isAuthenticated, isOperator, async (req, res) => {
  const deptId = req.params.id;
  const { user_id } = req.body;
  if (!deptId || !user_id) {
    req.flash('error', 'Invalid supervisor assignment');
    return res.redirect('/operator/departments');
  }
  try {
    await pool.query(
      `INSERT INTO department_supervisors (department_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE department_id = department_id`,
      [deptId, user_id]
    );
    req.flash('success', 'Supervisor assigned');
    res.redirect('/operator/departments');
  } catch (err) {
    console.error('Error assigning supervisor:', err);
    req.flash('error', 'Error assigning supervisor');
    res.redirect('/operator/departments');
  }
});

// POST attendance JSON upload for salary processing
router.post('/departments/salary/upload', isAuthenticated, isOperator, upload.single('attFile'), async (req, res) => {
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

module.exports = router;
