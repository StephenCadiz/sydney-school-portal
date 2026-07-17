"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  getCambridgeClassesForBulkCreate,
  getYoungLearnerClassesForBulkCreate,
} from "../../../lib/adminStudents";
import type {
  CambridgeBulkClassOption,
  YoungLearnerBulkClassOption,
} from "../../../lib/adminStudents";
import { supabase } from "../../../lib/supabase";

type ActiveTab = "teacher" | "cambridge" | "youngLearner" | "adminStaff";
type CreationMode = "manual" | "invite";
type CambridgeBulkRowField =
  | "first_name"
  | "last_name"
  | "email"
  | "password"
  | "student";
type CambridgeBulkRowErrors = Partial<Record<CambridgeBulkRowField, string>>;
type CambridgeBulkRow = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  show_password: boolean;
  errors: CambridgeBulkRowErrors;
};
type CambridgeDialog =
  | {
      type: "clear";
    }
  | {
      type: "changeClass";
      nextClassId: string;
    };
type YoungLearnerBulkRowField = "first_name" | "last_name" | "student";
type YoungLearnerBulkRowErrors = Partial<
  Record<YoungLearnerBulkRowField, string>
>;
type YoungLearnerBulkRow = {
  id: number;
  first_name: string;
  last_name: string;
  errors: YoungLearnerBulkRowErrors;
};
type YoungLearnerDialog =
  | {
      type: "clear";
    }
  | {
      type: "changeClass";
      nextClassId: string;
    };

const youngLearnerBulkRowCount = 12;
const youngLearnerMaxNameLength = 80;
const cambridgeBulkRowCount = 12;
const cambridgeMaxNameLength = 80;
const cambridgeMaxEmailLength = 254;
const cambridgeMinimumPasswordLength = 6;
const youngLearnerBulkRowFields: YoungLearnerBulkRowField[] = [
  "first_name",
  "last_name",
  "student",
];
const cambridgeBulkRowFields: CambridgeBulkRowField[] = [
  "first_name",
  "last_name",
  "email",
  "password",
  "student",
];

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9d9d9",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontWeight: 600,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

const cardStyle = {
  background: "#ffffff",
  borderRadius: "12px",
  border: "1px solid var(--ss-border)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  padding: "28px",
};

function getTabStyle(isActive: boolean) {
  return {
    background: isActive ? "var(--ss-blue)" : "#ffffff",
    color: isActive ? "#ffffff" : "var(--ss-blue-dark)",
    border: isActive ? "1px solid var(--ss-blue)" : "1px solid var(--ss-border)",
    borderRadius: "10px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "left" as const,
  };
}

function getModeButtonStyle(isActive: boolean) {
  return {
    background: isActive ? "var(--ss-blue)" : "#ffffff",
    color: isActive ? "#ffffff" : "var(--ss-blue-dark)",
    border: "1px solid var(--ss-blue)",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function formatCourseType(courseType: string) {
  if (!courseType) return "-";

  return courseType.charAt(0).toUpperCase() + courseType.slice(1);
}

function formatTimeRange(startTime: string, endTime: string) {
  if (startTime && endTime) {
    return `${startTime}-${endTime}`;
  }

  return "";
}

function formatYoungLearnerClassOption(
  classroom: YoungLearnerBulkClassOption
) {
  const timeSlot = formatTimeRange(classroom.start_time, classroom.end_time);
  const schedule = [classroom.days, timeSlot].filter(Boolean).join(" ");

  return [
    classroom.level_name || "Unknown Level",
    classroom.classroom_name || "No classroom assigned",
    schedule,
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatCambridgeClassOption(classroom: CambridgeBulkClassOption) {
  const timeSlot = formatTimeRange(classroom.start_time, classroom.end_time);
  const schedule = [classroom.days, timeSlot].filter(Boolean).join(" ");
  const levelAndCourse = [
    classroom.level_name || "Unknown Level",
    formatCourseType(classroom.course_type),
  ]
    .filter((item) => item && item !== "-")
    .join(" ");

  return [
    levelAndCourse || "Unknown Cambridge Class",
    schedule,
    classroom.classroom_name || "Not assigned",
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatYoungLearnerSubmitLabel(count: number, saving: boolean) {
  if (saving) {
    return `Adding ${count || 0} student${count === 1 ? "" : "s"}...`;
  }

  if (count > 0) {
    return `Add ${count} Young Learner${count === 1 ? "" : "s"}`;
  }

  return "Add Young Learners";
}

function formatCambridgeSubmitLabel(count: number, saving: boolean) {
  if (saving) {
    return `Adding ${count || 0} student${count === 1 ? "" : "s"}...`;
  }

  if (count > 0) {
    return `Add ${count} Cambridge Student${count === 1 ? "" : "s"}`;
  }

  return "Add Cambridge Students";
}

function getYoungLearnerMessageType(message: string) {
  const normalizedMessage = message.toLowerCase();

  return normalizedMessage.includes("successfully") &&
    !normalizedMessage.includes("attention")
    ? "success"
    : "error";
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M10 9.2V14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10 6.2H10.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getCambridgeMethodText(row: CambridgeBulkRow, rowErrors: CambridgeBulkRowErrors) {
  const rowHasText = Boolean(
    row.first_name || row.last_name || row.email || row.password
  );

  if (rowErrors.password) {
    return "Password requires attention";
  }

  if (!rowHasText) {
    return "Enter student details";
  }

  if (row.password.length > 0) {
    return "Manual password - no email will be sent";
  }

  return "Invitation email will be sent";
}

function getCambridgeMethodClass(
  row: CambridgeBulkRow,
  rowErrors: CambridgeBulkRowErrors
) {
  if (rowErrors.password) {
    return "add-users-cambridge-method-error";
  }

  if (row.password.length > 0) {
    return "add-users-cambridge-method-manual";
  }

  return "add-users-cambridge-method-invite";
}

function createInitialCambridgeRows(): CambridgeBulkRow[] {
  return Array.from({ length: cambridgeBulkRowCount }, (_, index) => ({
    id: index + 1,
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    show_password: false,
    errors: {},
  }));
}

function getInitialAuthForm() {
  return {
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  };
}

function createInitialYoungLearnerRows(): YoungLearnerBulkRow[] {
  return Array.from({ length: youngLearnerBulkRowCount }, (_, index) => ({
    id: index + 1,
    first_name: "",
    last_name: "",
    errors: {},
  }));
}

function normalizeCambridgeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidCambridgeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCambridgeRows(rows: CambridgeBulkRow[]) {
  const errorsByRow: Record<number, CambridgeBulkRowErrors> = {};
  const completeRows: Array<{
    row: number;
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    method: "invitation" | "manual";
  }> = [];
  let hasEnteredRows = false;

  rows.forEach((row) => {
    const firstName = row.first_name.trim();
    const lastName = row.last_name.trim();
    const email = normalizeCambridgeEmail(row.email);
    const password = row.password;
    const rowHasText = Boolean(
      row.first_name || row.last_name || row.email || row.password
    );

    if (!rowHasText) {
      return;
    }

    hasEnteredRows = true;

    if (!firstName) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        first_name: "First name is required.",
      };
    } else if (firstName.length > cambridgeMaxNameLength) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        first_name: `First name must be ${cambridgeMaxNameLength} characters or fewer.`,
      };
    }

    if (!lastName) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        last_name: "Last name is required.",
      };
    } else if (lastName.length > cambridgeMaxNameLength) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        last_name: `Last name must be ${cambridgeMaxNameLength} characters or fewer.`,
      };
    }

    if (!email) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        email: "Email is required.",
      };
    } else if (
      email.length > cambridgeMaxEmailLength ||
      !isValidCambridgeEmail(email)
    ) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        email: "Enter a valid email address.",
      };
    }

    if (row.email.trim() && /\s/.test(row.email.trim())) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        email: "Email cannot contain spaces.",
      };
    }

    if (password.length > 0 && !password.trim()) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        password: "Enter a valid password or clear the field completely.",
      };
    } else if (
      password.length > 0 &&
      password.length < cambridgeMinimumPasswordLength
    ) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        password: "Password must be at least 6 characters.",
      };
    }

    if (
      firstName &&
      lastName &&
      email &&
      firstName.length <= cambridgeMaxNameLength &&
      lastName.length <= cambridgeMaxNameLength &&
      email.length <= cambridgeMaxEmailLength &&
      isValidCambridgeEmail(email) &&
      !/\s/.test(row.email.trim()) &&
      (password.length === 0 ||
        (password.trim() && password.length >= cambridgeMinimumPasswordLength))
    ) {
      completeRows.push({
        row: row.id,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        method: password.length > 0 ? "manual" : "invitation",
      });
    }
  });

  const duplicateRows = new Set<number>();
  const rowsByEmail = completeRows.reduce<Record<string, number[]>>(
    (groups, row) => ({
      ...groups,
      [row.email]: [...(groups[row.email] || []), row.row],
    }),
    {}
  );

  Object.values(rowsByEmail)
    .filter((rowsWithEmail) => rowsWithEmail.length > 1)
    .flat()
    .forEach((rowId) => {
      duplicateRows.add(rowId);
      errorsByRow[rowId] = {
        ...errorsByRow[rowId],
        email: "Duplicate email address in this batch.",
      };
    });

  return {
    completeRows: completeRows.filter((row) => !duplicateRows.has(row.row)),
    errorsByRow,
    hasEnteredRows,
    hasErrors: Object.keys(errorsByRow).length > 0,
  };
}

function normalizeYoungLearnerFullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function validateYoungLearnerRows(rows: YoungLearnerBulkRow[]) {
  const errorsByRow: Record<number, YoungLearnerBulkRowErrors> = {};
  const completeRows: Array<{
    row: number;
    first_name: string;
    last_name: string;
    normalized_name: string;
  }> = [];
  let hasEnteredRows = false;

  rows.forEach((row) => {
    const firstName = row.first_name.trim();
    const lastName = row.last_name.trim();
    const hasFirstName = firstName.length > 0;
    const hasLastName = lastName.length > 0;

    if (!hasFirstName && !hasLastName) {
      return;
    }

    hasEnteredRows = true;

    if (!hasFirstName) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        first_name: "First name is required.",
      };
    }

    if (!hasLastName) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        last_name: "Last name is required.",
      };
    }

    if (firstName.length > youngLearnerMaxNameLength) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        first_name: `First name must be ${youngLearnerMaxNameLength} characters or fewer.`,
      };
    }

    if (lastName.length > youngLearnerMaxNameLength) {
      errorsByRow[row.id] = {
        ...errorsByRow[row.id],
        last_name: `Last name must be ${youngLearnerMaxNameLength} characters or fewer.`,
      };
    }

    if (
      hasFirstName &&
      hasLastName &&
      firstName.length <= youngLearnerMaxNameLength &&
      lastName.length <= youngLearnerMaxNameLength
    ) {
      completeRows.push({
        row: row.id,
        first_name: firstName,
        last_name: lastName,
        normalized_name: normalizeYoungLearnerFullName(firstName, lastName),
      });
    }
  });

  const rowsByName = completeRows.reduce<Record<string, number[]>>(
    (groups, row) => ({
      ...groups,
      [row.normalized_name]: [...(groups[row.normalized_name] || []), row.row],
    }),
    {}
  );

  Object.values(rowsByName)
    .filter((duplicateRows) => duplicateRows.length > 1)
    .flat()
    .forEach((rowId) => {
      errorsByRow[rowId] = {
        ...errorsByRow[rowId],
        student: "Duplicate name in this batch.",
      };
    });

  return {
    completeRows,
    errorsByRow,
    hasEnteredRows,
    hasErrors: Object.keys(errorsByRow).length > 0,
  };
}

export default function AddUsersPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("teacher");
  const [teacherMode, setTeacherMode] = useState<CreationMode>("manual");
  const [teacherForm, setTeacherForm] = useState(getInitialAuthForm);
  const [cambridgeClassId, setCambridgeClassId] = useState("");
  const [cambridgeRows, setCambridgeRows] = useState(createInitialCambridgeRows);
  const [cambridgeDialog, setCambridgeDialog] = useState<CambridgeDialog | null>(
    null
  );
  const [youngLearnerClassId, setYoungLearnerClassId] = useState("");
  const [youngLearnerRows, setYoungLearnerRows] = useState(
    createInitialYoungLearnerRows
  );
  const [youngLearnerDialog, setYoungLearnerDialog] =
    useState<YoungLearnerDialog | null>(null);
  const [adminForm, setAdminForm] = useState({
    ...getInitialAuthForm(),
    confirm_password: "",
  });
  const [cambridgeClasses, setCambridgeClasses] = useState<
    CambridgeBulkClassOption[]
  >([]);
  const [youngLearnerClasses, setYoungLearnerClasses] = useState<
    YoungLearnerBulkClassOption[]
  >([]);
  const [classMessage, setClassMessage] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const cambridgeFirstNameRefs = useRef<Record<number, HTMLInputElement | null>>(
    {}
  );
  const cambridgeLastNameRefs = useRef<Record<number, HTMLInputElement | null>>(
    {}
  );
  const cambridgeEmailRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cambridgePasswordRefs = useRef<
    Record<number, HTMLInputElement | null>
  >({});
  const youngLearnerFirstNameRefs = useRef<
    Record<number, HTMLInputElement | null>
  >({});
  const youngLearnerLastNameRefs = useRef<
    Record<number, HTMLInputElement | null>
  >({});

  const selectedCambridgeClass = useMemo(
    () =>
      cambridgeClasses.find((classroom) => classroom.id === cambridgeClassId) ||
      null,
    [cambridgeClasses, cambridgeClassId]
  );
  const cambridgeValidation = useMemo(
    () => validateCambridgeRows(cambridgeRows),
    [cambridgeRows]
  );
  const cambridgeRowsHaveStoredErrors = useMemo(
    () =>
      cambridgeRows.some((row) =>
        Object.values(row.errors).some((message) => Boolean(message))
      ),
    [cambridgeRows]
  );
  const hasCambridgeEntries = useMemo(
    () =>
      cambridgeRows.some(
        (row) =>
          row.first_name.trim() ||
          row.last_name.trim() ||
          row.email.trim() ||
          row.password
      ),
    [cambridgeRows]
  );
  const cambridgeInvitationCount = cambridgeValidation.completeRows.filter(
    (row) => row.method === "invitation"
  ).length;
  const cambridgeManualCount = cambridgeValidation.completeRows.filter(
    (row) => row.method === "manual"
  ).length;

  const selectedYoungLearnerClass = useMemo(
    () =>
      youngLearnerClasses.find(
        (classroom) => classroom.id === youngLearnerClassId
      ) || null,
    [youngLearnerClasses, youngLearnerClassId]
  );
  const youngLearnerValidation = useMemo(
    () => validateYoungLearnerRows(youngLearnerRows),
    [youngLearnerRows]
  );
  const youngLearnerRowsHaveStoredErrors = useMemo(
    () =>
      youngLearnerRows.some((row) =>
        Object.values(row.errors).some((message) => Boolean(message))
      ),
    [youngLearnerRows]
  );
  const hasYoungLearnerEntries = useMemo(
    () =>
      youngLearnerRows.some(
        (row) => row.first_name.trim() || row.last_name.trim()
      ),
    [youngLearnerRows]
  );

  useEffect(() => {
    async function loadClasses() {
      setLoadingClasses(true);
      setClassMessage("");

      try {
        const [cambridgeData, youngLearnerData] = await Promise.all([
          getCambridgeClassesForBulkCreate(),
          getYoungLearnerClassesForBulkCreate(),
        ]);

        setCambridgeClasses(cambridgeData);
        setYoungLearnerClasses(youngLearnerData);

        if (cambridgeData.length === 0 && youngLearnerData.length === 0) {
          setClassMessage("No classes found.");
        }
      } catch (error) {
        console.error("Unable to load class options:", error);
        setClassMessage("Unable to load class options.");
      } finally {
        setLoadingClasses(false);
      }
    }

    loadClasses();
  }, []);

  async function refreshCambridgeClasses() {
    const cambridgeData = await getCambridgeClassesForBulkCreate();
    setCambridgeClasses(cambridgeData);
  }

  async function refreshYoungLearnerClasses() {
    const youngLearnerData = await getYoungLearnerClassesForBulkCreate();
    setYoungLearnerClasses(youngLearnerData);
  }

  async function postWithSession(path: string, payload: any) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("You must be logged in as an admin.");
    }

    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.details || result.error || "Unable to save user.");
    }

    return result;
  }

  function validatePassword(password: string) {
    if (!password) {
      return "Password is required.";
    }

    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }

    return "";
  }

  async function handleTeacherSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (teacherMode === "manual") {
        const passwordError = validatePassword(teacherForm.password);

        if (passwordError) {
          setMessage(passwordError);
          return;
        }
      }

      const result = await postWithSession(
        teacherMode === "manual"
          ? "/api/admin/teachers/create-manual"
          : "/api/admin/teachers/invite",
        teacherMode === "manual"
          ? teacherForm
          : {
              first_name: teacherForm.first_name,
              last_name: teacherForm.last_name,
              email: teacherForm.email,
            }
      );

      setTeacherForm(getInitialAuthForm());
      setMessage(result.message || "Teacher saved successfully.");
    } catch (error: any) {
      console.error("Unable to save teacher:", error);
      setMessage(error.message || "Unable to save teacher.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCambridgeStudentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!cambridgeClassId) {
      setMessage("Please select a Cambridge class.");
      return;
    }

    const validation = validateCambridgeRows(cambridgeRows);

    if (validation.completeRows.length === 0 && !validation.hasEnteredRows) {
      setMessage("Add at least one Cambridge student row before saving.");
      focusCambridgeRow(1);
      return;
    }

    if (validation.hasErrors || validation.completeRows.length === 0) {
      setCambridgeRows((currentRows) =>
        currentRows.map((row) => ({
          ...row,
          errors: validation.errorsByRow[row.id] || {},
        }))
      );
      setMessage("Please correct the highlighted rows.");
      focusFirstCambridgeError(validation.errorsByRow);
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in as an admin.");
      }

      const response = await fetch("/api/admin/students/create-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          class_id: cambridgeClassId,
          students: validation.completeRows.map((row) => ({
            row: row.row,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            password: row.password,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (Array.isArray(result.errors)) {
          const serverErrorsByRow = result.errors.reduce(
            (
              rowErrors: Record<number, CambridgeBulkRowErrors>,
              error: {
                row?: number;
                field?: CambridgeBulkRowField;
                message?: string;
              }
            ) => {
              const rowId = Number(error.row);
              const field = error.field;

              if (
                !Number.isInteger(rowId) ||
                rowId < 1 ||
                rowId > cambridgeBulkRowCount ||
                !field ||
                !cambridgeBulkRowFields.includes(field)
              ) {
                return rowErrors;
              }

              return {
                ...rowErrors,
                [rowId]: {
                  ...rowErrors[rowId],
                  [field]: error.message || "Please check this row.",
                },
              };
            },
            {}
          );

          setCambridgeRows((currentRows) =>
            currentRows.map((row) => ({
              ...row,
              errors: serverErrorsByRow[row.id] || {},
            }))
          );
          setMessage("Please correct the highlighted rows.");
          focusFirstCambridgeError(serverErrorsByRow);
          return;
        }

        throw new Error(result.error || "Unable to create Cambridge students.");
      }

      try {
        await refreshCambridgeClasses();
      } catch (refreshError) {
        console.error("Unable to refresh Cambridge class counts:", refreshError);
      }

      const rowResults: Array<{
        row?: number;
        status?: "created" | "failed";
        method?: "invitation" | "manual";
        message?: string;
      }> = Array.isArray(result.results) ? result.results : [];
      const createdRows = new Set(
        rowResults
          .filter((rowResult) => rowResult.status === "created")
          .map((rowResult) => Number(rowResult.row))
      );
      const failedResultsByRow = rowResults.reduce<
        Record<number, { method?: "invitation" | "manual"; message?: string }>
      >((failedRows, rowResult) => {
        const rowId = Number(rowResult.row);

        if (
          rowResult.status !== "failed" ||
          !Number.isInteger(rowId) ||
          rowId < 1 ||
          rowId > cambridgeBulkRowCount
        ) {
          return failedRows;
        }

        return {
          ...failedRows,
          [rowId]: {
            method: rowResult.method,
            message: rowResult.message,
          },
        };
      }, {});

      if (Number(result.failed_count || 0) > 0) {
        setCambridgeRows((currentRows) =>
          currentRows.map((row) => {
            const failedResult = failedResultsByRow[row.id];

            if (createdRows.has(row.id)) {
              return {
                ...row,
                first_name: "",
                last_name: "",
                email: "",
                password: "",
                show_password: false,
                errors: {},
              };
            }

            if (failedResult) {
              return {
                ...row,
                password: "",
                show_password: false,
                errors: {
                  student: [
                    failedResult.message || "Unable to create this student.",
                    failedResult.method === "manual"
                      ? "Re-enter the password before trying this row again."
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                },
              };
            }

            return {
              ...row,
              errors: {},
            };
          })
        );

        const createdCount = Number(result.created_count || 0);
        const failedCount = Number(result.failed_count || 0);
        setMessage(
          `${createdCount} student${
            createdCount === 1 ? " was" : "s were"
          } added successfully. ${failedCount} student${
            failedCount === 1 ? "" : "s"
          } ${failedCount === 1 ? "requires" : "require"} attention.`
        );
        const firstFailedRow = Object.keys(failedResultsByRow)
          .map(Number)
          .sort((first, second) => first - second)[0];
        focusCambridgeRow(firstFailedRow || 1);
        return;
      }

      resetCambridgeRows(true);
      const createdCount = Number(result.created_count || 0);
      const invitedCount = Number(result.invited_count || 0);
      const manualCount = Number(result.manual_count || 0);
      const savedClassLabel =
        selectedCambridgeClass?.class_label ||
        "the selected Cambridge class";
      const methodSummary = [
        invitedCount > 0
          ? `${invitedCount} invitation email${
              invitedCount === 1 ? " was" : "s were"
            } sent`
          : "",
        manualCount > 0
          ? `${manualCount} account${
              manualCount === 1 ? " was" : "s were"
            } created with manual passwords`
          : "",
      ]
        .filter(Boolean)
        .join(". ");

      setMessage(
        `${createdCount} Cambridge student${
          createdCount === 1 ? "" : "s"
        } added successfully to ${savedClassLabel}.${
          methodSummary ? `\n${methodSummary}.` : ""
        }`
      );
    } catch (error: any) {
      console.error("Unable to save Cambridge students:", error);
      setMessage(error.message || "Unable to save Cambridge students.");
    } finally {
      setSaving(false);
    }
  }

  function focusCambridgeRow(
    rowId: number,
    field: CambridgeBulkRowField = "first_name"
  ) {
    window.setTimeout(() => {
      if (field === "last_name") {
        cambridgeLastNameRefs.current[rowId]?.focus();
        return;
      }

      if (field === "email") {
        cambridgeEmailRefs.current[rowId]?.focus();
        return;
      }

      if (field === "password") {
        cambridgePasswordRefs.current[rowId]?.focus();
        return;
      }

      cambridgeFirstNameRefs.current[rowId]?.focus();
    }, 0);
  }

  function focusFirstCambridgeError(
    errorsByRow: Record<number, CambridgeBulkRowErrors>
  ) {
    const firstErrorRow = Object.keys(errorsByRow)
      .map(Number)
      .sort((first, second) => first - second)[0];

    if (!firstErrorRow) {
      focusCambridgeRow(1);
      return;
    }

    const rowErrors = errorsByRow[firstErrorRow];
    const firstErrorField =
      cambridgeBulkRowFields.find((field) => Boolean(rowErrors?.[field])) ||
      "first_name";

    focusCambridgeRow(
      firstErrorRow,
      firstErrorField === "student" ? "first_name" : firstErrorField
    );
  }

  function resetCambridgeRows(shouldFocusFirstRow = false) {
    setCambridgeRows(createInitialCambridgeRows());

    if (shouldFocusFirstRow) {
      focusCambridgeRow(1);
    }
  }

  function updateCambridgeRow(
    rowId: number,
    field: Exclude<CambridgeBulkRowField, "student">,
    value: string
  ) {
    setCambridgeRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
              errors: {},
            }
          : row
      )
    );
  }

  function toggleCambridgePassword(rowId: number) {
    setCambridgeRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              show_password: !row.show_password,
            }
          : row
      )
    );
  }

  function requestCambridgeClassChange(nextClassId: string) {
    if (saving || nextClassId === cambridgeClassId) {
      return;
    }

    if (hasCambridgeEntries) {
      setCambridgeDialog({
        type: "changeClass",
        nextClassId,
      });
      return;
    }

    setCambridgeClassId(nextClassId);
    resetCambridgeRows();
  }

  function requestClearCambridgeRows() {
    if (!hasCambridgeEntries) {
      resetCambridgeRows(true);
      return;
    }

    setCambridgeDialog({ type: "clear" });
  }

  function confirmCambridgeDialog() {
    if (!cambridgeDialog) {
      return;
    }

    if (cambridgeDialog.type === "changeClass") {
      setCambridgeClassId(cambridgeDialog.nextClassId);
    }

    resetCambridgeRows(true);
    setCambridgeDialog(null);
    setMessage("");
  }

  function focusYoungLearnerRow(
    rowId: number,
    field: "first_name" | "last_name" = "first_name"
  ) {
    window.setTimeout(() => {
      if (field === "last_name") {
        youngLearnerLastNameRefs.current[rowId]?.focus();
        return;
      }

      youngLearnerFirstNameRefs.current[rowId]?.focus();
    }, 0);
  }

  function focusFirstYoungLearnerError(
    errorsByRow: Record<number, YoungLearnerBulkRowErrors>
  ) {
    const firstErrorRow = Object.keys(errorsByRow)
      .map(Number)
      .sort((first, second) => first - second)[0];

    if (!firstErrorRow) {
      focusYoungLearnerRow(1);
      return;
    }

    const rowErrors = errorsByRow[firstErrorRow];
    focusYoungLearnerRow(
      firstErrorRow,
      rowErrors?.last_name && !rowErrors?.first_name
        ? "last_name"
        : "first_name"
    );
  }

  function resetYoungLearnerRows(shouldFocusFirstRow = false) {
    setYoungLearnerRows(createInitialYoungLearnerRows());

    if (shouldFocusFirstRow) {
      focusYoungLearnerRow(1);
    }
  }

  function updateYoungLearnerRow(
    rowId: number,
    field: "first_name" | "last_name",
    value: string
  ) {
    setYoungLearnerRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
              errors: {},
            }
          : row
      )
    );
  }

  function requestYoungLearnerClassChange(nextClassId: string) {
    if (saving || nextClassId === youngLearnerClassId) {
      return;
    }

    if (hasYoungLearnerEntries) {
      setYoungLearnerDialog({
        type: "changeClass",
        nextClassId,
      });
      return;
    }

    setYoungLearnerClassId(nextClassId);
    resetYoungLearnerRows();
  }

  function requestClearYoungLearnerRows() {
    if (!hasYoungLearnerEntries) {
      resetYoungLearnerRows(true);
      return;
    }

    setYoungLearnerDialog({ type: "clear" });
  }

  function confirmYoungLearnerDialog() {
    if (!youngLearnerDialog) {
      return;
    }

    if (youngLearnerDialog.type === "changeClass") {
      setYoungLearnerClassId(youngLearnerDialog.nextClassId);
    }

    resetYoungLearnerRows(true);
    setYoungLearnerDialog(null);
    setMessage("");
  }

  async function handleYoungLearnerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!youngLearnerClassId) {
      setMessage("Please select a Young Learner class.");
      return;
    }

    const validation = validateYoungLearnerRows(youngLearnerRows);

    if (validation.completeRows.length === 0 && !validation.hasEnteredRows) {
      setMessage("Add at least one Young Learner row before saving.");
      focusYoungLearnerRow(1);
      return;
    }

    if (validation.hasErrors || validation.completeRows.length === 0) {
      setYoungLearnerRows((currentRows) =>
        currentRows.map((row) => ({
          ...row,
          errors: validation.errorsByRow[row.id] || {},
        }))
      );
      setMessage("Please correct the highlighted Young Learner rows.");
      focusFirstYoungLearnerError(validation.errorsByRow);
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in as an admin.");
      }

      const response = await fetch("/api/admin/young-learners/create-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          class_id: youngLearnerClassId,
          students: validation.completeRows.map((row) => ({
            row: row.row,
            first_name: row.first_name,
            last_name: row.last_name,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (Array.isArray(result.errors)) {
          const serverErrorsByRow = result.errors.reduce(
            (
              rowErrors: Record<number, YoungLearnerBulkRowErrors>,
              error: {
                row?: number;
                field?: YoungLearnerBulkRowField;
                message?: string;
              }
            ) => {
              const rowId = Number(error.row);
              const field = error.field;

              if (
                !Number.isInteger(rowId) ||
                rowId < 1 ||
                rowId > youngLearnerBulkRowCount ||
                !field ||
                !youngLearnerBulkRowFields.includes(field)
              ) {
                return rowErrors;
              }

              return {
                ...rowErrors,
                [rowId]: {
                  ...rowErrors[rowId],
                  [field]: error.message || "Please check this row.",
                },
              };
            },
            {}
          );

          setYoungLearnerRows((currentRows) =>
            currentRows.map((row) => ({
              ...row,
              errors: serverErrorsByRow[row.id] || {},
            }))
          );
          setMessage("Please correct the highlighted Young Learner rows.");
          focusFirstYoungLearnerError(serverErrorsByRow);
          return;
        }

        throw new Error(result.error || "Unable to create Young Learners.");
      }

      try {
        await refreshYoungLearnerClasses();
      } catch (refreshError) {
        console.error("Unable to refresh Young Learner class counts:", refreshError);
      }

      resetYoungLearnerRows(true);
      const createdCount = Number(result.created_count || 0);
      const savedClassLabel =
        result.class_label ||
        selectedYoungLearnerClass?.class_label ||
        "the selected class";
      setMessage(
        `${createdCount} Young Learner${
          createdCount === 1 ? "" : "s"
        } added successfully to ${savedClassLabel}.`
      );
    } catch (error: any) {
      console.error("Unable to save Young Learners:", error);
      setMessage(error.message || "Unable to save Young Learners.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdminStaffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const passwordError = validatePassword(adminForm.password);

      if (passwordError) {
        setMessage(passwordError);
        return;
      }

      if (adminForm.password !== adminForm.confirm_password) {
        setMessage("Passwords do not match.");
        return;
      }

      const result = await postWithSession(
        "/api/admin/admin-staff/create-manual",
        {
          first_name: adminForm.first_name,
          last_name: adminForm.last_name,
          email: adminForm.email,
          password: adminForm.password,
        }
      );

      setAdminForm({
        ...getInitialAuthForm(),
        confirm_password: "",
      });
      setMessage(result.message || "Admin staff account created successfully.");
    } catch (error: any) {
      console.error("Unable to save admin staff:", error);
      setMessage(error.message || "Unable to save admin staff.");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "teacher", label: "Add Teacher" },
    { id: "cambridge", label: "Add Cambridge Student" },
    { id: "youngLearner", label: "Add Young Learner" },
    { id: "adminStaff", label: "Add Admin Staff" },
  ] as const;

  return (
    <AdminLayout>
      <h1
        style={{
          color: "var(--ss-blue-dark)",
          marginBottom: "10px",
        }}
      >
        Add Users
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "28px",
        }}
      >
        Create teachers, Cambridge students, Young Learners and admin staff.
      </p>

      {message && activeTab !== "youngLearner" && activeTab !== "cambridge" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid var(--ss-border)",
            padding: "14px",
            marginBottom: "20px",
            color: "#333",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "12px",
          marginBottom: "22px",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setMessage("");
            }}
            style={getTabStyle(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "teacher" && (
        <form onSubmit={handleTeacherSubmit} style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Add Teacher
          </h2>

          <CreationModeControl
            mode={teacherMode}
            onChange={setTeacherMode}
            manualText="Create the login directly without sending an invitation email."
            inviteText="Send an email invite so the teacher can choose their password."
          />

          <AuthFields
            form={teacherForm}
            setForm={setTeacherForm}
            showPassword={teacherMode === "manual"}
          />

          <SubmitButton saving={saving}>
            {teacherMode === "manual" ? "Create Teacher Account" : "Invite Teacher"}
          </SubmitButton>
        </form>
      )}

      {activeTab === "cambridge" && (
        <form
          onSubmit={handleCambridgeStudentSubmit}
          className="add-users-young-form add-users-young-card add-users-cambridge-card"
        >
          <div className="add-users-young-header add-users-cambridge-header">
            <div>
              <h2>Add Cambridge Students</h2>
              <p>
                Select a Cambridge class and add up to 12 students at once.
                Leave Initial Password blank to send an invitation email, or
                enter a password to create the account manually.
              </p>
              <p className="add-users-cambridge-password-note">
                Passwords are never saved in the browser and are cleared after
                a server request.
              </p>
            </div>
            <div className="add-users-cambridge-counter-group">
              <div className="add-users-young-counter">
                {cambridgeValidation.completeRows.length} of{" "}
                {cambridgeBulkRowCount} ready
              </div>
              <div className="add-users-cambridge-method-counts">
                <span>
                  {cambridgeInvitationCount} invitation email
                  {cambridgeInvitationCount === 1 ? "" : "s"}
                </span>
                <span>
                  {cambridgeManualCount} manual-password account
                  {cambridgeManualCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          {message && (
            <div
              className={`add-users-young-message add-users-young-message-${getYoungLearnerMessageType(
                message
              )}`}
              role="status"
              aria-live="polite"
            >
              {message}
            </div>
          )}

          <div className="add-users-young-workflow add-users-cambridge-workflow">
            <section className="add-users-young-step add-users-young-step-class">
              <div className="add-users-young-step-heading">
                <span className="add-users-young-step-number">1</span>
                <div>
                  <h3>Choose class</h3>
                  <p>Select the Cambridge group for this batch.</p>
                </div>
              </div>

              <label
                className="add-users-young-label"
                htmlFor="cambridge-class-id"
              >
                Cambridge Class
              </label>
              <select
                id="cambridge-class-id"
                required
                className="add-users-young-select add-users-young-class-select"
                value={cambridgeClassId}
                disabled={saving || loadingClasses}
                onChange={(event) =>
                  requestCambridgeClassChange(event.target.value)
                }
              >
                <option value="">Select a Cambridge class</option>
                {cambridgeClasses.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {formatCambridgeClassOption(classroom)}
                  </option>
                ))}
              </select>

              {loadingClasses ? (
                <p className="add-users-young-help">Loading classes...</p>
              ) : classMessage ? (
                <p className="add-users-young-help">{classMessage}</p>
              ) : cambridgeClasses.length === 0 ? (
                <p className="add-users-young-help">
                  No Cambridge classes are available yet.
                </p>
              ) : null}

              <div className="add-users-young-info">
                <InfoIcon />
                <span>
                  B1, B2, C1 and C2 classes are included. Support Classes and
                  Young Learner classes are excluded.
                </span>
              </div>
            </section>

            <section className="add-users-young-step add-users-young-step-summary">
              <div className="add-users-young-step-heading">
                <span className="add-users-young-step-number">2</span>
                <div>
                  <h3>Class summary</h3>
                  <p>Check the selected class before saving.</p>
                </div>
              </div>

              {selectedCambridgeClass ? (
                <dl className="add-users-young-summary">
                  <div className="add-users-young-summary-row">
                    <dt>Level</dt>
                    <dd>{selectedCambridgeClass.level_name || "Unknown Level"}</dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Course type</dt>
                    <dd>
                      {formatCourseType(selectedCambridgeClass.course_type) ||
                        "Not assigned"}
                    </dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Teacher</dt>
                    <dd>{selectedCambridgeClass.teacher_name}</dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Schedule</dt>
                    <dd>
                      {[
                        selectedCambridgeClass.days,
                        formatTimeRange(
                          selectedCambridgeClass.start_time,
                          selectedCambridgeClass.end_time
                        ),
                      ]
                        .filter(Boolean)
                        .join(" - ") || "Not scheduled"}
                    </dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Classroom</dt>
                    <dd>{selectedCambridgeClass.classroom_name}</dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Current Cambridge students</dt>
                    <dd>
                      {selectedCambridgeClass.current_cambridge_student_count}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="add-users-young-summary-empty">
                  Select a Cambridge class to view its details.
                </div>
              )}
            </section>

            <section
              className={`add-users-young-step add-users-young-step-entry add-users-cambridge-entry ${
                cambridgeClassId ? "" : "add-users-young-step-disabled"
              }`}
            >
              <div className="add-users-young-step-heading">
                <span className="add-users-young-step-number">3</span>
                <div>
                  <h3>Add students</h3>
                  <p>Up to 12 students</p>
                </div>
              </div>

              <div
                className="add-users-young-table add-users-cambridge-table"
                aria-label="Cambridge student rows"
              >
                <div className="add-users-young-grid-header add-users-cambridge-grid-header">
                  <span>#</span>
                  <span>First Name</span>
                  <span>Last Name</span>
                  <span>Email</span>
                  <span>Initial Password</span>
                  <span>Account Method</span>
                </div>

                <div className="add-users-young-table-body">
                  {cambridgeRows.map((row) => {
                    const rowErrors = {
                      ...cambridgeValidation.errorsByRow[row.id],
                      ...row.errors,
                    };
                    const firstNameId = `cambridge-${row.id}-first-name`;
                    const lastNameId = `cambridge-${row.id}-last-name`;
                    const emailId = `cambridge-${row.id}-email`;
                    const passwordId = `cambridge-${row.id}-password`;
                    const firstNameErrorId = `${firstNameId}-error`;
                    const lastNameErrorId = `${lastNameId}-error`;
                    const emailErrorId = `${emailId}-error`;
                    const passwordErrorId = `${passwordId}-error`;
                    const rowErrorId = `cambridge-${row.id}-error`;
                    const hasRowError = Boolean(
                      rowErrors.first_name ||
                        rowErrors.last_name ||
                        rowErrors.email ||
                        rowErrors.password ||
                        rowErrors.student
                    );
                    const firstNameDescribedBy = [
                      rowErrors.first_name ? firstNameErrorId : "",
                      rowErrors.student ? rowErrorId : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const lastNameDescribedBy = [
                      rowErrors.last_name ? lastNameErrorId : "",
                      rowErrors.student ? rowErrorId : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const emailDescribedBy = [
                      rowErrors.email ? emailErrorId : "",
                      rowErrors.student ? rowErrorId : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const passwordDescribedBy = [
                      rowErrors.password ? passwordErrorId : "",
                      rowErrors.student ? rowErrorId : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <div
                        className={`add-users-young-row add-users-cambridge-row ${
                          hasRowError ? "add-users-young-row-error" : ""
                        }`}
                        key={row.id}
                      >
                        <div className="add-users-young-row-number">
                          <span className="add-users-young-row-mobile-label">
                            Student{" "}
                          </span>
                          {row.id}
                        </div>

                        <div className="add-users-young-field">
                          <label
                            className="add-users-young-field-label"
                            htmlFor={firstNameId}
                          >
                            First Name
                          </label>
                          <input
                            id={firstNameId}
                            aria-label={`Student ${row.id} First Name`}
                            placeholder="First name"
                            ref={(element) => {
                              cambridgeFirstNameRefs.current[row.id] = element;
                            }}
                            autoComplete="given-name"
                            maxLength={cambridgeMaxNameLength}
                            value={row.first_name}
                            disabled={!cambridgeClassId || saving}
                            aria-invalid={Boolean(
                              rowErrors.first_name || rowErrors.student
                            )}
                            aria-describedby={
                              firstNameDescribedBy || undefined
                            }
                            onChange={(event) =>
                              updateCambridgeRow(
                                row.id,
                                "first_name",
                                event.target.value
                              )
                            }
                          />
                          {rowErrors.first_name && (
                            <span
                              className="add-users-young-field-error"
                              id={firstNameErrorId}
                            >
                              {rowErrors.first_name}
                            </span>
                          )}
                        </div>

                        <div className="add-users-young-field">
                          <label
                            className="add-users-young-field-label"
                            htmlFor={lastNameId}
                          >
                            Last Name
                          </label>
                          <input
                            id={lastNameId}
                            aria-label={`Student ${row.id} Last Name`}
                            placeholder="Last name"
                            ref={(element) => {
                              cambridgeLastNameRefs.current[row.id] = element;
                            }}
                            autoComplete="family-name"
                            maxLength={cambridgeMaxNameLength}
                            value={row.last_name}
                            disabled={!cambridgeClassId || saving}
                            aria-invalid={Boolean(
                              rowErrors.last_name || rowErrors.student
                            )}
                            aria-describedby={lastNameDescribedBy || undefined}
                            onChange={(event) =>
                              updateCambridgeRow(
                                row.id,
                                "last_name",
                                event.target.value
                              )
                            }
                          />
                          {rowErrors.last_name && (
                            <span
                              className="add-users-young-field-error"
                              id={lastNameErrorId}
                            >
                              {rowErrors.last_name}
                            </span>
                          )}
                        </div>

                        <div className="add-users-young-field">
                          <label
                            className="add-users-young-field-label"
                            htmlFor={emailId}
                          >
                            Email
                          </label>
                          <input
                            id={emailId}
                            aria-label={`Student ${row.id} Email`}
                            placeholder="student@example.com"
                            ref={(element) => {
                              cambridgeEmailRefs.current[row.id] = element;
                            }}
                            autoComplete="email"
                            inputMode="email"
                            maxLength={cambridgeMaxEmailLength}
                            value={row.email}
                            disabled={!cambridgeClassId || saving}
                            aria-invalid={Boolean(
                              rowErrors.email || rowErrors.student
                            )}
                            aria-describedby={emailDescribedBy || undefined}
                            onChange={(event) =>
                              updateCambridgeRow(
                                row.id,
                                "email",
                                event.target.value
                              )
                            }
                          />
                          {rowErrors.email && (
                            <span
                              className="add-users-young-field-error"
                              id={emailErrorId}
                            >
                              {rowErrors.email}
                            </span>
                          )}
                        </div>

                        <div className="add-users-young-field add-users-cambridge-password-field">
                          <label
                            className="add-users-young-field-label"
                            htmlFor={passwordId}
                          >
                            Initial Password
                          </label>
                          <div className="add-users-cambridge-password-wrap">
                            <input
                              id={passwordId}
                              aria-label={`Student ${row.id} Initial Password`}
                              placeholder="Optional"
                              ref={(element) => {
                                cambridgePasswordRefs.current[row.id] =
                                  element;
                              }}
                              autoComplete="new-password"
                              minLength={cambridgeMinimumPasswordLength}
                              type={row.show_password ? "text" : "password"}
                              value={row.password}
                              disabled={!cambridgeClassId || saving}
                              aria-invalid={Boolean(
                                rowErrors.password || rowErrors.student
                              )}
                              aria-describedby={
                                passwordDescribedBy || undefined
                              }
                              onChange={(event) =>
                                updateCambridgeRow(
                                  row.id,
                                  "password",
                                  event.target.value
                                )
                              }
                            />
                            <button
                              type="button"
                              className="add-users-cambridge-password-toggle"
                              disabled={!cambridgeClassId || saving}
                              aria-label={`${
                                row.show_password ? "Hide" : "Show"
                              } password for Student ${row.id}`}
                              aria-pressed={row.show_password}
                              onClick={() => toggleCambridgePassword(row.id)}
                            >
                              {row.show_password ? "Hide" : "Show"}
                            </button>
                          </div>
                          {rowErrors.password && (
                            <span
                              className="add-users-young-field-error"
                              id={passwordErrorId}
                            >
                              {rowErrors.password}
                            </span>
                          )}
                        </div>

                        <div className="add-users-cambridge-method-cell">
                          <span
                            className={`add-users-cambridge-method ${getCambridgeMethodClass(
                              row,
                              rowErrors
                            )}`}
                          >
                            {getCambridgeMethodText(row, rowErrors)}
                          </span>
                        </div>

                        {rowErrors.student && (
                          <p
                            className="add-users-young-row-message add-users-cambridge-row-message"
                            id={rowErrorId}
                          >
                            {rowErrors.student}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <footer className="add-users-young-footer">
            <p className="add-users-young-footer-info">
              <InfoIcon />
              <span>
                Blank rows are ignored. Invitation rows send a setup email;
                manual-password rows create the login directly.
              </span>
            </p>

            <div className="add-users-young-actions">
              <button
                type="button"
                className="add-users-young-clear"
                disabled={saving || !hasCambridgeEntries}
                onClick={requestClearCambridgeRows}
              >
                Clear All
              </button>
              <button
                type="submit"
                className="add-users-young-submit"
                disabled={
                  saving ||
                  loadingClasses ||
                  !cambridgeClassId ||
                  cambridgeValidation.completeRows.length === 0 ||
                  cambridgeValidation.hasErrors ||
                  cambridgeRowsHaveStoredErrors
                }
              >
                {formatCambridgeSubmitLabel(
                  cambridgeValidation.completeRows.length,
                  saving
                )}
              </button>
            </div>
          </footer>

          {cambridgeDialog && (
            <div
              className="add-users-young-dialog-backdrop"
              role="presentation"
              onClick={() => setCambridgeDialog(null)}
            >
              <div
                className="add-users-young-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-users-cambridge-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="add-users-cambridge-dialog-title">
                  {cambridgeDialog.type === "clear"
                    ? "Clear entered students?"
                    : "Change class?"}
                </h3>
                <p>
                  {cambridgeDialog.type === "clear"
                    ? "This will remove all Cambridge student details currently entered. The selected class will remain unchanged."
                    : "Changing class will clear the entered student details, including any passwords. Continue?"}
                </p>
                <div className="add-users-young-dialog-actions">
                  <button
                    type="button"
                    className="add-users-young-dialog-cancel"
                    onClick={() => setCambridgeDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`add-users-young-dialog-confirm ${
                      cambridgeDialog.type === "clear"
                        ? "add-users-young-dialog-confirm-danger"
                        : ""
                    }`}
                    onClick={confirmCambridgeDialog}
                  >
                    {cambridgeDialog.type === "clear"
                      ? "Clear All"
                      : "Change Class"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {activeTab === "youngLearner" && (
        <form
          onSubmit={handleYoungLearnerSubmit}
          className="add-users-young-form add-users-young-card"
        >
          <div className="add-users-young-header">
            <div>
              <h2>Add Young Learners</h2>
              <p>
                Select a class and add up to 12 students at once. Young Learners
                do not receive Student Portal access, so no email or password is
                needed.
              </p>
            </div>
            <div className="add-users-young-counter">
              {youngLearnerValidation.completeRows.length} of{" "}
              {youngLearnerBulkRowCount} ready
            </div>
          </div>

          {message && (
            <div
              className={`add-users-young-message add-users-young-message-${getYoungLearnerMessageType(
                message
              )}`}
              role="status"
              aria-live="polite"
            >
              {message}
            </div>
          )}

          <div className="add-users-young-workflow">
            <section className="add-users-young-step add-users-young-step-class">
              <div className="add-users-young-step-heading">
                <span className="add-users-young-step-number">1</span>
                <div>
                  <h3>Choose class</h3>
                  <p>Select the group for this batch.</p>
                </div>
              </div>

              <label className="add-users-young-label" htmlFor="young-class-id">
                Young Learner Class
              </label>
              <select
                id="young-class-id"
                required
                className="add-users-young-select add-users-young-class-select"
                value={youngLearnerClassId}
                disabled={saving || loadingClasses}
                onChange={(event) =>
                  requestYoungLearnerClassChange(event.target.value)
                }
              >
                <option value="">Select a Young Learner class</option>
                {youngLearnerClasses.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {formatYoungLearnerClassOption(classroom)}
                  </option>
                ))}
              </select>

              {loadingClasses ? (
                <p className="add-users-young-help">Loading classes...</p>
              ) : classMessage ? (
                <p className="add-users-young-help">{classMessage}</p>
              ) : youngLearnerClasses.length === 0 ? (
                <p className="add-users-young-help">
                  No Young Learner classes are available yet.
                </p>
              ) : null}

              <div className="add-users-young-info">
                <InfoIcon />
                <span>Cambridge and Support Classes are excluded from this list.</span>
              </div>
            </section>

            <section className="add-users-young-step add-users-young-step-summary">
              <div className="add-users-young-step-heading">
                <span className="add-users-young-step-number">2</span>
                <div>
                  <h3>Class summary</h3>
                  <p>Review the selected class details.</p>
                </div>
              </div>

              {selectedYoungLearnerClass ? (
                <dl className="add-users-young-summary">
                  <div className="add-users-young-summary-row">
                    <dt>Level / Class</dt>
                    <dd>
                      {[
                        selectedYoungLearnerClass.level_name || "Unknown Level",
                        selectedYoungLearnerClass.classroom_name,
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Teacher</dt>
                    <dd>{selectedYoungLearnerClass.teacher_name}</dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Schedule</dt>
                    <dd>
                      {[
                        selectedYoungLearnerClass.days,
                        formatTimeRange(
                          selectedYoungLearnerClass.start_time,
                          selectedYoungLearnerClass.end_time
                        ),
                      ]
                        .filter(Boolean)
                        .join(" - ") || "Not scheduled"}
                    </dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Classroom</dt>
                    <dd>{selectedYoungLearnerClass.classroom_name}</dd>
                  </div>
                  <div className="add-users-young-summary-row">
                    <dt>Current active students</dt>
                    <dd>
                      {selectedYoungLearnerClass.active_young_learner_count}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="add-users-young-summary-empty">
                  Select a class to view its details.
                </div>
              )}
            </section>

            <section
              className={`add-users-young-step add-users-young-step-entry ${
                youngLearnerClassId ? "" : "add-users-young-step-disabled"
              }`}
            >
              <div className="add-users-young-step-heading">
                <span className="add-users-young-step-number">3</span>
                <div>
                  <h3>Add students</h3>
                  <p>Up to 12 students</p>
                </div>
              </div>

              <div
                className="add-users-young-table"
                aria-label="Young Learner rows"
              >
                <div className="add-users-young-grid-header">
                  <span>#</span>
                  <span>First Name</span>
                  <span>Last Name</span>
                </div>

                <div className="add-users-young-table-body">
                  {youngLearnerRows.map((row) => {
                    const rowErrors = {
                      ...youngLearnerValidation.errorsByRow[row.id],
                      ...row.errors,
                    };
                    const firstNameId = `young-learner-${row.id}-first-name`;
                    const lastNameId = `young-learner-${row.id}-last-name`;
                    const firstNameErrorId = `${firstNameId}-error`;
                    const lastNameErrorId = `${lastNameId}-error`;
                    const rowErrorId = `young-learner-${row.id}-error`;
                    const hasRowError = Boolean(
                      rowErrors.first_name ||
                        rowErrors.last_name ||
                        rowErrors.student
                    );
                    const firstNameDescribedBy = [
                      rowErrors.first_name ? firstNameErrorId : "",
                      rowErrors.student ? rowErrorId : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const lastNameDescribedBy = [
                      rowErrors.last_name ? lastNameErrorId : "",
                      rowErrors.student ? rowErrorId : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <div
                        className={`add-users-young-row ${
                          hasRowError ? "add-users-young-row-error" : ""
                        }`}
                        key={row.id}
                      >
                        <div className="add-users-young-row-number">
                          <span className="add-users-young-row-mobile-label">
                            Student{" "}
                          </span>
                          {row.id}
                        </div>

                        <div className="add-users-young-field">
                          <label
                            className="add-users-young-field-label"
                            htmlFor={firstNameId}
                          >
                            First Name
                          </label>
                          <input
                            id={firstNameId}
                            aria-label={`Student ${row.id} First Name`}
                            placeholder="First name"
                            ref={(element) => {
                              youngLearnerFirstNameRefs.current[row.id] =
                                element;
                            }}
                            autoComplete="off"
                            maxLength={youngLearnerMaxNameLength}
                            value={row.first_name}
                            disabled={!youngLearnerClassId || saving}
                            aria-invalid={Boolean(
                              rowErrors.first_name || rowErrors.student
                            )}
                            aria-describedby={
                              firstNameDescribedBy || undefined
                            }
                            onChange={(event) =>
                              updateYoungLearnerRow(
                                row.id,
                                "first_name",
                                event.target.value
                              )
                            }
                          />
                          {rowErrors.first_name && (
                            <span
                              className="add-users-young-field-error"
                              id={firstNameErrorId}
                            >
                              {rowErrors.first_name}
                            </span>
                          )}
                        </div>

                        <div className="add-users-young-field">
                          <label
                            className="add-users-young-field-label"
                            htmlFor={lastNameId}
                          >
                            Last Name
                          </label>
                          <input
                            id={lastNameId}
                            aria-label={`Student ${row.id} Last Name`}
                            placeholder="Last name"
                            ref={(element) => {
                              youngLearnerLastNameRefs.current[row.id] =
                                element;
                            }}
                            autoComplete="off"
                            maxLength={youngLearnerMaxNameLength}
                            value={row.last_name}
                            disabled={!youngLearnerClassId || saving}
                            aria-invalid={Boolean(
                              rowErrors.last_name || rowErrors.student
                            )}
                            aria-describedby={lastNameDescribedBy || undefined}
                            onChange={(event) =>
                              updateYoungLearnerRow(
                                row.id,
                                "last_name",
                                event.target.value
                              )
                            }
                          />
                          {rowErrors.last_name && (
                            <span
                              className="add-users-young-field-error"
                              id={lastNameErrorId}
                            >
                              {rowErrors.last_name}
                            </span>
                          )}
                        </div>

                        {rowErrors.student && (
                          <p
                            className="add-users-young-row-message"
                            id={rowErrorId}
                          >
                            {rowErrors.student}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <footer className="add-users-young-footer">
            <p className="add-users-young-footer-info">
              <InfoIcon />
              <span>
                Blank rows are ignored. Rows with only one name are highlighted
                before saving.
              </span>
            </p>

            <div className="add-users-young-actions">
              <button
                type="button"
                className="add-users-young-clear"
                disabled={saving || !hasYoungLearnerEntries}
                onClick={requestClearYoungLearnerRows}
              >
                Clear All
              </button>
              <button
                type="submit"
                className="add-users-young-submit"
                disabled={
                  saving ||
                  loadingClasses ||
                  !youngLearnerClassId ||
                  youngLearnerValidation.completeRows.length === 0 ||
                  youngLearnerValidation.hasErrors ||
                  youngLearnerRowsHaveStoredErrors
                }
              >
                {formatYoungLearnerSubmitLabel(
                  youngLearnerValidation.completeRows.length,
                  saving
                )}
              </button>
            </div>
          </footer>

          {youngLearnerDialog && (
            <div
              className="add-users-young-dialog-backdrop"
              role="presentation"
              onClick={() => setYoungLearnerDialog(null)}
            >
              <div
                className="add-users-young-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-users-young-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="add-users-young-dialog-title">
                  {youngLearnerDialog.type === "clear"
                    ? "Clear entered students?"
                    : "Change class?"}
                </h3>
                <p>
                  {youngLearnerDialog.type === "clear"
                    ? "This will remove all names currently entered. The selected class will remain unchanged."
                    : "Changing class will clear the entered student names. Continue?"}
                </p>
                <div className="add-users-young-dialog-actions">
                  <button
                    type="button"
                    className="add-users-young-dialog-cancel"
                    onClick={() => setYoungLearnerDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`add-users-young-dialog-confirm ${
                      youngLearnerDialog.type === "clear"
                        ? "add-users-young-dialog-confirm-danger"
                        : ""
                    }`}
                    onClick={confirmYoungLearnerDialog}
                  >
                    {youngLearnerDialog.type === "clear"
                      ? "Clear All"
                      : "Change Class"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {activeTab === "adminStaff" && (
        <form onSubmit={handleAdminStaffSubmit} style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Add Admin Staff
          </h2>

          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: "10px",
              padding: "14px",
              color: "#7c2d12",
              marginBottom: "22px",
            }}
          >
            Admin staff accounts can access academy management tools. Only create
            admin staff accounts for trusted users.
          </div>

          <AuthFields form={adminForm} setForm={setAdminForm} showPassword />

          <div style={{ marginTop: "20px" }}>
            <label style={labelStyle}>Confirm Password</label>
            <input
              required
              type="password"
              minLength={6}
              style={inputStyle}
              value={adminForm.confirm_password}
              onChange={(event) =>
                setAdminForm((current) => ({
                  ...current,
                  confirm_password: event.target.value,
                }))
              }
            />
          </div>

          <SubmitButton saving={saving}>Create Admin Staff Account</SubmitButton>
        </form>
      )}
    </AdminLayout>
  );
}

function CreationModeControl({
  mode,
  onChange,
  manualText,
  inviteText,
}: {
  mode: CreationMode;
  onChange: (mode: CreationMode) => void;
  manualText: string;
  inviteText: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ss-border)",
        borderRadius: "10px",
        padding: "14px",
        marginBottom: "22px",
        background: "#f8f9fc",
      }}
    >
      <label style={labelStyle}>Creation method</label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <button
          type="button"
          onClick={() => onChange("manual")}
          style={getModeButtonStyle(mode === "manual")}
        >
          Create manually with password
        </button>

        <button
          type="button"
          onClick={() => onChange("invite")}
          style={getModeButtonStyle(mode === "invite")}
        >
          Send invitation email
        </button>
      </div>
      <p style={{ color: "#666", marginBottom: 0 }}>
        {mode === "manual" ? manualText : inviteText}
      </p>
    </div>
  );
}

function AuthFields({
  form,
  setForm,
  showPassword,
}: {
  form: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  };
  setForm: (updater: any) => void;
  showPassword: boolean;
}) {
  function updateField(field: string, value: string) {
    setForm((current: any) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "20px",
      }}
    >
      <div>
        <label style={labelStyle}>First Name</label>
        <input
          required
          style={inputStyle}
          value={form.first_name}
          onChange={(event) => updateField("first_name", event.target.value)}
        />
      </div>

      <div>
        <label style={labelStyle}>Last Name</label>
        <input
          required
          style={inputStyle}
          value={form.last_name}
          onChange={(event) => updateField("last_name", event.target.value)}
        />
      </div>

      <div>
        <label style={labelStyle}>Email</label>
        <input
          required
          type="email"
          style={inputStyle}
          value={form.email}
          onChange={(event) => updateField("email", event.target.value)}
        />
      </div>

      {showPassword && (
        <div>
          <label style={labelStyle}>Password</label>
          <input
            required
            type="password"
            minLength={6}
            style={inputStyle}
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function SubmitButton({
  children,
  saving,
}: {
  children: React.ReactNode;
  saving: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        background: "var(--ss-blue)",
        color: "#ffffff",
        border: "none",
        borderRadius: "8px",
        padding: "12px 22px",
        marginTop: "25px",
        cursor: saving ? "not-allowed" : "pointer",
        fontWeight: 700,
        opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? "Saving..." : children}
    </button>
  );
}
