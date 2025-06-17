const express = require('express');
const router = express.Router();
const multer = require('multer');
const moment = require('moment');
const { pool } = require('../config/db');
const { isAuthenticated, isOperator } = require('../middlewares/auth');

const upload = multer();

// GET /attendance - show upload form and department management
router.get('/', isAuthenticated, isOperator, async (req, res) => {
  try {
    const [supervisors] = await pool.query(
      `SELECT u.id, u.username
         FROM users u
         JOIN roles r ON u.role_id = r.id
        WHERE r.name='supervisor' AND u.is_active=TRUE
        ORDER BY u.username`
    );
    const [departments] = await pool.query(
      `SELECT d.id, d.name, d.supervisor_id, u.username AS supervisor
         FROM departments d
         LEFT JOIN users u ON d.supervisor_id = u.id
        ORDER BY d.name`
    );
    res.render('operatorAttendance', {
      user: req.session.user,
      logs: null,
      supervisors,
      departments
    });
  } catch (err) {
    console.error('Error loading attendance page:', err);
    res.render('operatorAttendance', {
      user: req.session.user,
      logs: null,
      supervisors: [],
      departments: []
    });
  }
});

// POST /attendance/upload - process JSON attendance
router.post('/upload', isAuthenticated, isOperator, upload.single('attendanceFile'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'No attendance file uploaded');
    return res.redirect('/attendance');
  }

  const fname = req.file.originalname;
  const match = fname.match(/^([A-Za-z0-9]+)[_+\-]([A-Za-z0-9]+)\.json$/i);
  if (!match) {
    req.flash('error', 'Filename must be departmentName+supervisorName.json');
    return res.redirect('/attendance');
  }
  const deptName = match[1];
  const supervisorName = match[2];
  try {
    const [rows] = await pool.query(
      `SELECT d.id FROM departments d
        JOIN users u ON d.supervisor_id = u.id
       WHERE d.name = ? AND u.username = ?`,
      [deptName, supervisorName]
    );
    if (!rows.length) {
      req.flash('error', 'Department and supervisor mismatch');
      return res.redirect('/attendance');
    }
  } catch (err) {
    console.error('Error validating filename:', err);
    req.flash('error', 'Invalid file name');
    return res.redirect('/attendance');
  }

  let records;
  try {
    records = JSON.parse(req.file.buffer.toString());
  } catch (err) {
    req.flash('error', 'Invalid JSON file');
    return res.redirect('/attendance');
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    for (const emp of records) {
      const punchingId = emp.punchingId;
      const name = emp.name;
      if (!Array.isArray(emp.attendance)) continue;
      for (const att of emp.attendance) {
        const date = att.date;
        const punchInRaw = att.punchIn;
        const punchOutRaw = att.punchOut;

        const punchIn = punchInRaw ? moment(punchInRaw, 'HH:mm').format('HH:mm:ss') : null;
        const punchOut = punchOutRaw ? moment(punchOutRaw, 'HH:mm').format('HH:mm:ss') : null;

        let hoursWorked = 0;
        if (punchIn && punchOut) {
          const minutes = moment(punchOut, 'HH:mm:ss').diff(moment(punchIn, 'HH:mm:ss'), 'minutes');
          if (Number.isFinite(minutes)) {
            hoursWorked = +(minutes / 60).toFixed(2);
          }
        }

        await conn.query(
          `INSERT INTO operator_attendance (punching_id, name, work_date, punch_in, punch_out, hours_worked)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE punch_in=VALUES(punch_in), punch_out=VALUES(punch_out), hours_worked=VALUES(hours_worked)`,
          [punchingId, name, date, punchIn, punchOut, hoursWorked]
        );
      }
    }
    await conn.commit();
    req.flash('success', 'Attendance uploaded');
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Error processing attendance:', err);
    req.flash('error', 'Could not process attendance');
  } finally {
    if (conn) conn.release();
  }
  res.redirect('/attendance');
});

// POST /attendance/department/create - create a new department
router.post('/department/create', isAuthenticated, isOperator, async (req, res) => {
  const { name, supervisor_id } = req.body;
  if (!name) {
    req.flash('error', 'Department name required');
    return res.redirect('/attendance');
  }
  try {
    let supId = supervisor_id || null;
    if (supId) {
      const [rows] = await pool.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=? AND r.name='supervisor'`,
        [supId]
      );
      if (!rows.length) {
        req.flash('error', 'Invalid supervisor selected');
        return res.redirect('/attendance');
      }
      const [exists] = await pool.query('SELECT id FROM departments WHERE supervisor_id=?', [supId]);
      if (exists.length) {
        req.flash('error', 'Supervisor already assigned to another department');
        return res.redirect('/attendance');
      }
    }
    await pool.query('INSERT INTO departments (name, supervisor_id) VALUES (?, ?)', [name, supId]);
    req.flash('success', 'Department created');
  } catch (err) {
    console.error('Error creating department:', err);
    req.flash('error', 'Could not create department');
  }
  res.redirect('/attendance');
});

// POST /attendance/department/:id/update-supervisor - change supervisor
router.post('/department/:id/update-supervisor', isAuthenticated, isOperator, async (req, res) => {
  const deptId = req.params.id;
  const { supervisor_id } = req.body;
  try {
    const [rows] = await pool.query(
      `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=? AND r.name='supervisor'`,
      [supervisor_id]
    );
    if (!rows.length) {
      req.flash('error', 'Invalid supervisor selected');
      return res.redirect('/attendance');
    }
    const [exists] = await pool.query('SELECT id FROM departments WHERE supervisor_id=? AND id<>?', [supervisor_id, deptId]);
    if (exists.length) {
      req.flash('error', 'Supervisor already assigned to another department');
      return res.redirect('/attendance');
    }
    await pool.query('UPDATE departments SET supervisor_id=? WHERE id=?', [supervisor_id, deptId]);
    req.flash('success', 'Supervisor updated');
  } catch (err) {
    console.error('Error updating supervisor:', err);
    req.flash('error', 'Could not update supervisor');
  }
  res.redirect('/attendance');
});

module.exports = router;
