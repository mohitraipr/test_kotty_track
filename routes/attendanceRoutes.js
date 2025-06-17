const express = require('express');
const router = express.Router();
const multer = require('multer');
const moment = require('moment');
const { pool } = require('../config/db');
const { isAuthenticated, isOperator } = require('../middlewares/auth');

const upload = multer();

// GET /attendance - show upload form
router.get('/', isAuthenticated, isOperator, (req, res) => {
  res.render('operatorAttendance', { user: req.session.user, logs: null });
});

// POST /attendance/upload - process JSON attendance
router.post('/upload', isAuthenticated, isOperator, upload.single('attendanceFile'), async (req, res) => {
  if (!req.file) {
    req.flash('error', 'No attendance file uploaded');
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
        let punchIn = att.punchIn || null;
        let punchOut = att.punchOut || null;
        let hoursWorked = 0;
        let status = 'absent';

        if (punchIn && punchOut) {
          const minutes = moment(punchOut, 'HH:mm').diff(moment(punchIn, 'HH:mm'), 'minutes');
          hoursWorked = Number(minutes / 60).toFixed(2);
          status = 'present';
        } else {
          punchIn = null;
          punchOut = null;
        }

        await conn.query(
          `INSERT INTO operator_attendance (punching_id, name, work_date, punch_in, punch_out, hours_worked, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE punch_in=VALUES(punch_in), punch_out=VALUES(punch_out), hours_worked=VALUES(hours_worked), status=VALUES(status)`,
          [punchingId, name, date, punchIn, punchOut, hoursWorked, status]
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

module.exports = router;
