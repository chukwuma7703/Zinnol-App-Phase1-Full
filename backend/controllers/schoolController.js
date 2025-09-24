import asyncHandler from "express-async-handler";
import School from "../models/School.js";
import User from "../models/userModel.js";
import { roles } from "../config/roles.js";
import AppError from "../utils/AppError.js";
import { ok, created } from "../utils/ApiResponse.js";
import { Readable } from "stream";

/**
 * @desc    Create a new school
 * @route   POST /api/schools
 * @access  Protected (Global Super Admin)
 */
export const createSchool = asyncHandler(async (req, res, next) => {
  const { name, address, phone, email, numberOfStudents, numberOfTeachers, website, description, lat, lng, mainSuperAdminName, mainSuperAdminEmail, mainSuperAdminPhone } = req.body;

  if (!name) {
    return next(new AppError("School name is required.", 400));
  }

  const schoolData = {
    name,
    address,
    phone,
    email, // Add the missing email field
    numberOfStudents: numberOfStudents || 0,
    numberOfTeachers: numberOfTeachers || 0,
  };

  // Add optional fields if provided
  if (website) schoolData.website = website;
  if (description) schoolData.description = description;
  if (lat !== undefined) schoolData.lat = lat;
  if (lng !== undefined) schoolData.lng = lng;

  // If MAIN_SUPER_ADMIN, auto-assign as owner
  if (req.user.role === roles.MAIN_SUPER_ADMIN) {
    schoolData.mainSuperAdmins = [req.user._id];
  }

  let school = await School.create(schoolData);

  // Optionally create/assign a Main Super Admin if details provided
  if (mainSuperAdminName && (mainSuperAdminEmail || mainSuperAdminPhone)) {
    // Check if a user with provided email exists; if not, create a minimal account with a random password
    let adminUser = null;
    if (mainSuperAdminEmail) {
      adminUser = await User.findOne({ email: mainSuperAdminEmail });
    }
    if (!adminUser) {
      const randomPass = Math.random().toString(36).slice(2, 10) + "A1!";
      adminUser = await User.create({
        name: mainSuperAdminName,
        email: mainSuperAdminEmail || `${Date.now()}@placeholder.local`,
        password: randomPass,
        role: roles.MAIN_SUPER_ADMIN,
        school: school._id,
      });
    } else {
      // ensure role and school
      adminUser.role = roles.MAIN_SUPER_ADMIN;
      adminUser.school = school._id;
      await adminUser.save();
    }
    // Link to school if not already linked
    if (!school.mainSuperAdmins.some(id => id.toString() === adminUser._id.toString())) {
      school.mainSuperAdmins.push(adminUser._id);
      await school.save();
    }
  }

  // Populate mainSuperAdmins for immediate frontend display
  school = await School.findById(school._id).populate("mainSuperAdmins", "name email");

  created(res, { school }, "School created successfully");
});

/**
 * @desc    Get all schools
 * @route   GET /api/schools
 * @access  Private (Global Super Admin)
 */
export const getSchools = asyncHandler(async (req, res, next) => {
  // This route is only accessible to GLOBAL_SUPER_ADMIN as defined in the routes file.
  // Use lean so we can attach computed fields easily
  let schools = await School.find({})
    .populate("mainSuperAdmins", "name email")
    .lean();

  // Compute per-school student and teacher counts efficiently
  const schoolIds = schools.map((s) => s._id);
  if (schoolIds.length) {
    const counts = await User.aggregate([
      { $match: { school: { $in: schoolIds } } },
      { $match: { role: { $in: [roles.STUDENT, roles.TEACHER] } } },
      { $group: { _id: { school: "$school", role: "$role" }, count: { $sum: 1 } } },
    ]);

    const bySchool = new Map();
    for (const row of counts) {
      const sId = row._id.school.toString();
      const role = row._id.role;
      const entry = bySchool.get(sId) || { student: 0, teacher: 0 };
      if (role === roles.STUDENT) entry.student = row.count;
      if (role === roles.TEACHER) entry.teacher = row.count;
      bySchool.set(sId, entry);
    }

    schools = schools.map((s) => {
      const key = s._id.toString();
      const c = bySchool.get(key) || {};
      return {
        ...s,
        studentCount: c.student ?? s.numberOfStudents ?? (Array.isArray(s.students) ? s.students.length : 0) ?? 0,
        teacherCount: c.teacher ?? s.numberOfTeachers ?? (Array.isArray(s.teachers) ? s.teachers.length : 0) ?? 0,
      };
    });
  }

  // Wrapping in an object is a good practice for API consistency
  ok(res, { schools });
});

/**
 * @desc    Assign a Main Super Admin to a school
 * @route   POST /api/schools/:id/assign-main-super-admin
 * @access  Protected (Global Super Admin)
 */
export const assignMainSuperAdmin = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;
  const { id: schoolId } = req.params;

  const school = await School.findById(schoolId);
  if (!school) {
    return next(new AppError("School not found", 404));
  }

  const user = await User.findById(userId);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.role === roles.GLOBAL_SUPER_ADMIN) {
    return next(new AppError("Cannot assign a Global Super Admin as a Main Super Admin", 400));
  }

  if (school.mainSuperAdmins.map(id => id.toString()).includes(userId.toString())) {
    return res.json({ message: "User is already a Main Super Admin for this school.", school });
  }

  // Enforce maximum of 10 Super Admins per school
  if (school.mainSuperAdmins.length >= 10) {
    return next(new AppError("Maximum number of Main Super Admins (10) reached for this school.", 400));
  }

  school.mainSuperAdmins.push(userId);
  await school.save();

  // Promote the user and assign them to the school
  user.role = roles.MAIN_SUPER_ADMIN;
  user.school = school._id;
  await user.save();

  ok(res, { school }, "Main Super Admin assigned");
});

/**
 * @desc    Remove a Main Super Admin from a school
 * @route   DELETE /api/schools/:id/remove-main-super-admin
 * @access  Protected (Global Super Admin)
 */
export const removeMainSuperAdmin = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;
  const { school } = req; // from checkSchoolAccess middleware

  // Prevents a user from removing themselves if they are the last admin
  if (school.mainSuperAdmins.length === 1 && school.mainSuperAdmins[0].toString() === userId) {
    if (req.user._id.toString() === userId) {
      return next(new AppError("You cannot remove yourself if you are the last Main Super Admin", 400));
    }
    return next(new AppError("You cannot remove the last Main Super Admin", 400));
  }

  school.mainSuperAdmins.pull(userId);
  await school.save();

  // Demote the user to a default role and disassociate from the school
  await User.findByIdAndUpdate(userId, { $set: { role: roles.TEACHER, school: null } });
  ok(res, { school }, "Main Super Admin removed");
});

/**
 * @desc    Assign a Main Super Admin to a school by email (create if missing)
 * @route   POST /api/schools/:id/assign-main-super-admin-by-email
 * @access  Protected (Global Super Admin)
 */
export const assignMainSuperAdminByEmail = asyncHandler(async (req, res, next) => {
  const { name, email, phone } = req.body;
  const { id: schoolId } = req.params;

  if (!email || !name) {
    return next(new AppError("name and email are required", 400));
  }

  const school = await School.findById(schoolId);
  if (!school) return next(new AppError("School not found", 404));

  // Find or create user by email
  let user = await User.findOne({ email });
  if (!user) {
    const randomPass = Math.random().toString(36).slice(2, 10) + "A1!";
    user = await User.create({
      name,
      email,
      password: randomPass,
      role: roles.MAIN_SUPER_ADMIN,
      school: school._id,
      phone,
    });
  } else {
    // Promote and assign school
    user.role = roles.MAIN_SUPER_ADMIN;
    user.school = school._id;
    await user.save();
  }

  // Ensure linked on school
  if (!school.mainSuperAdmins.some((id) => id.toString() === user._id.toString())) {
    school.mainSuperAdmins.push(user._id);
    await school.save();
  }

  const populated = await School.findById(school._id).populate("mainSuperAdmins", "name email");
  ok(res, { school: populated }, "Main Super Admin assigned by email");
});

/**
 * @desc    Add a new student to a school
 * @route   POST /api/schools/:id/students
 * @access  Protected (Main Super Admin, Principal)
 */
export const addStudentToSchool = asyncHandler(async (req, res, next) => {
  const { name, email, password, className } = req.body;
  const { school } = req; // from checkSchoolAccess middleware

  if (!name || !email || !password) {
    return next(new AppError("name, email and password are required", 400));
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    return next(new AppError("User with this email already exists.", 400));
  }

  const student = await User.create({
    name,
    email,
    password,
    className,
    role: roles.STUDENT,
    school: school._id,
  });

  school.students.push(student._id);
  await school.save();

  // Convert to plain object to modify the role property for the response.
  // The test expects a lowercase role, while the database stores it in uppercase.
  const studentObject = student.toObject();
  studentObject.role = studentObject.role.toLowerCase();

  created(res, { student: studentObject }, "Student created");
});

/**
 * @desc    Update a student's details in a school
 * @route   PUT /api/schools/:id/students/:studentId
 * @access  Protected (Main Super Admin, Principal)
 */
export const updateStudentInSchool = asyncHandler(async (req, res, next) => {
  // Middleware chain supplies: checkSchoolAccess -> req.school, checkStudentAccess -> req.student
  const { studentId } = req.params;
  const { school, student: middlewareStudent } = req;

  if (!school) {
    return next(new AppError("Server configuration error: school not loaded.", 500));
  }

  // If checkStudentAccess wasn't used (defensive), load student.
  let student = middlewareStudent;
  if (!student) {
    student = await User.findById(studentId);
  }

  if (!student || student.role !== roles.STUDENT || student.school?.toString() !== school._id.toString()) {
    return next(new AppError("Student not found", 404));
  }

  const { name, className } = req.body;
  if (name) student.name = name;
  if (className) student.className = className;

  const updatedStudent = await student.save();
  ok(res, { student: updatedStudent }, "Student updated");
});

/**
 * @desc    Remove a student from a school
 * @route   DELETE /api/schools/:schoolId/students/:studentId
 * @access  Protected (Main Super Admin, Principal)
 */
export const removeStudentFromSchool = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;
  const { school, student: middlewareStudent } = req;

  if (!school) {
    return next(new AppError("Server configuration error: school not loaded.", 500));
  }

  // Load student defensively if middleware not used.
  let student = middlewareStudent;
  if (!student) {
    student = await User.findOne({ _id: studentId, school: school._id, role: roles.STUDENT });
  }

  if (!student) {
    return next(new AppError("Student not found", 404));
  }

  // Remove student reference from school explicitly (test reliability)
  school.students = school.students.filter(sId => sId.toString() !== student._id.toString());
  await school.save();
  await student.deleteOne();
  ok(res, null, "Student removed successfully");
});

/**
 * @desc    Get a single school by ID
 * @route   GET /api/schools/:id
 * @access  Protected (Admins of that school)
 */
export const getSchoolById = asyncHandler(async (req, res) => {
  // The checkSchoolAccess middleware already found the school and attached it.
  // It also verified that the user has permission to access it.
  ok(res, { school: req.school });
});

/**
 * @desc    Update a school's details
 * @route   PUT /api/schools/:id
 * @access  Protected (Global/Main Super Admin)
 */
export const updateSchool = asyncHandler(async (req, res) => {
  const { school } = req; // from checkSchoolAccess middleware
  const { name, address, phone, numberOfStudents, numberOfTeachers } = req.body;

  school.name = name || school.name;
  school.address = address || school.address;
  school.phone = phone || school.phone;
  // Use the nullish coalescing operator (??) to allow updates to 0,
  // while ignoring undefined or null values.
  school.numberOfStudents = numberOfStudents ?? school.numberOfStudents;
  school.numberOfTeachers = numberOfTeachers ?? school.numberOfTeachers;

  const updatedSchool = await school.save();
  ok(res, { school: updatedSchool }, "School updated");
});

/**
 * @desc    Delete a school and its users
 * @route   DELETE /api/schools/:id
 * @access  Protected (Global Super Admin)
 */
export const deleteSchool = asyncHandler(async (req, res) => {
  const { school } = req; // from checkSchoolAccess middleware
  await User.deleteMany({ school: school._id });
  await School.findByIdAndDelete(school._id);
  ok(res, null, "School and all associated users removed");
});

/**
 * @desc    Export all schools as CSV
 * @route   GET /api/schools/export
 * @access  Protected (Global Super Admin)
 */
export const exportSchoolsCsv = asyncHandler(async (req, res) => {
  // Fetch minimal fields for CSV
  const schools = await School.find({}).select(
    "name address phone email website description numberOfStudents numberOfTeachers lat lng isActive createdAt updatedAt"
  );

  // CSV header
  const headers = [
    "name",
    "address",
    "phone",
    "email",
    "website",
    "description",
    "numberOfStudents",
    "numberOfTeachers",
    "lat",
    "lng",
    "isActive",
    "createdAt",
    "updatedAt",
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    // If contains special chars, wrap in quotes and escape quotes
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const rows = [headers.join(",")];
  for (const s of schools) {
    const row = [
      s.name,
      s.address,
      s.phone,
      s.email,
      s.website,
      s.description,
      s.numberOfStudents,
      s.numberOfTeachers,
      s.lat,
      s.lng,
      s.isActive,
      s.createdAt?.toISOString?.() || s.createdAt,
      s.updatedAt?.toISOString?.() || s.updatedAt,
    ].map(escapeCsv);
    rows.push(row.join(","));
  }

  const csv = rows.join("\n");

  // Suggest a filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `schools-export-${timestamp}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

  // Stream the CSV for better memory profile on large datasets
  const stream = Readable.from(csv);
  stream.pipe(res);
});

/**
 * @desc    Bulk approve schools (set isActive=true)
 * @route   POST /api/schools/bulk-approve
 * @access  Protected (Global Super Admin)
 */
export const bulkApproveSchools = asyncHandler(async (req, res, next) => {
  const { schoolIds } = req.body || {};
  if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
    return next(new AppError("schoolIds array is required", 400));
  }
  const result = await School.updateMany(
    { _id: { $in: schoolIds } },
    { $set: { isActive: true } }
  );
  ok(res, { matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified }, "Schools approved");
});

/**
 * @desc    Bulk reject schools (set isActive=false)
 * @route   POST /api/schools/bulk-reject
 * @access  Protected (Global Super Admin)
 */
export const bulkRejectSchools = asyncHandler(async (req, res, next) => {
  const { schoolIds } = req.body || {};
  if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
    return next(new AppError("schoolIds array is required", 400));
  }
  const result = await School.updateMany(
    { _id: { $in: schoolIds } },
    { $set: { isActive: false } }
  );
  ok(res, { matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified }, "Schools rejected");
});

/**
 * @desc    Activate a school (Global or Main Super Admin with access)
 * @route   PUT /api/schools/:id/activate
 * @access  Protected (Global/Main Super Admin)
 */
export const activateSchoolBasic = asyncHandler(async (req, res, next) => {
  const { school } = req; // from checkSchoolAccess
  if (!school) return next(new AppError('School not found', 404));
  if (school.isActive) return ok(res, { school }, 'School already active');
  school.isActive = true;
  const updated = await school.save();
  ok(res, { school: updated }, 'School activated successfully');
});

/**
 * @desc    Deactivate a school (Global or Main Super Admin with access)
 * @route   PUT /api/schools/:id/deactivate
 * @access  Protected (Global/Main Super Admin)
 */
export const deactivateSchoolBasic = asyncHandler(async (req, res, next) => {
  const { school } = req; // from checkSchoolAccess
  if (!school) return next(new AppError('School not found', 404));
  if (!school.isActive) return ok(res, { school }, 'School already inactive');
  school.isActive = false;
  const updated = await school.save();
  ok(res, { school: updated }, 'School deactivated successfully');
});
