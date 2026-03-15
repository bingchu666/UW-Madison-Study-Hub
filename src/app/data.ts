import { Task, Exam } from "./types";

export const mockTasks: Task[] = [
  {
    id: "1",
    courseCode: "CS 400",
    courseName: "Programming III",
    title: "Project 1 - Step 4",
    dueDate: new Date("2026-03-03T23:59:00"),
    status: "Not started",
    externalTool: "Gradescope",
    steps: [
      {
        id: "1-1",
        title: "Read full instructions on the course website",
        description: "Review the complete project requirements and rubric",
        completed: false,
        link: "https://example.com/cs400/project1",
        linkText: "View Instructions"
      },
      {
        id: "1-2",
        title: "Work on the code/complete files",
        description: "Implement the required functionality",
        completed: false
      },
      {
        id: "1-3",
        title: "Submit on external tool",
        description: "Upload your submission to Gradescope",
        completed: false,
        link: "https://gradescope.com",
        linkText: "Submit on Gradescope"
      },
      {
        id: "1-4",
        title: "Confirm submission in StudyHub",
        description: "Mark the assignment as submitted",
        completed: false
      }
    ]
  },
  {
    id: "2",
    courseCode: "MATH 340",
    courseName: "Elementary Matrix & Linear Algebra",
    title: "Homework 5",
    dueDate: new Date("2026-03-04T17:00:00"),
    status: "In progress",
    externalTool: "Course website"
  },
  {
    id: "3",
    courseCode: "STAT 340",
    courseName: "Data Science Modeling I",
    title: "Lab 3 - Data Visualization",
    dueDate: new Date("2026-03-05T23:59:00"),
    status: "Not started",
    externalTool: "Canvas"
  },
  {
    id: "4",
    courseCode: "CS 540",
    courseName: "Introduction to Artificial Intelligence",
    title: "Assignment 2 - Search Algorithms",
    dueDate: new Date("2026-03-06T23:59:00"),
    status: "Not started",
    externalTool: "Auto-grader"
  },
  {
    id: "5",
    courseCode: "ECON 101",
    courseName: "Principles of Microeconomics",
    title: "Problem Set 4",
    dueDate: new Date("2026-03-02T11:59:00"),
    status: "Not started",
    externalTool: "MyUW"
  },
  {
    id: "6",
    courseCode: "CS 400",
    courseName: "Programming III",
    title: "Weekly Quiz 6",
    dueDate: new Date("2026-03-07T23:59:00"),
    status: "Not started",
    externalTool: "Canvas"
  },
  {
    id: "7",
    courseCode: "MATH 340",
    courseName: "Elementary Matrix & Linear Algebra",
    title: "Reading Assignment - Chapter 4",
    dueDate: new Date("2026-03-10T09:00:00"),
    status: "Not started"
  },
  {
    id: "8",
    courseCode: "STAT 340",
    courseName: "Data Science Modeling I",
    title: "Project Proposal",
    dueDate: new Date("2026-02-28T23:59:00"),
    status: "Submitted",
    externalTool: "Canvas"
  }
];

export const mockExams: Exam[] = [
  {
    id: "e1",
    courseCode: "CS 540",
    courseName: "Introduction to Artificial Intelligence",
    type: "Midterm",
    date: new Date("2026-03-08T00:00:00"),
    time: "2:30 PM - 4:00 PM",
    location: "Humanities 3650",
    reminderSet: false,
    coursePageUrl: "https://canvas.wisc.edu/courses/cs540"
  },
  {
    id: "e2",
    courseCode: "MATH 340",
    courseName: "Elementary Matrix & Linear Algebra",
    type: "Midterm",
    date: new Date("2026-03-12T00:00:00"),
    time: "5:05 PM - 6:35 PM",
    location: "Sterling Hall B102",
    reminderSet: false,
    coursePageUrl: "https://canvas.wisc.edu/courses/math340"
  },
  {
    id: "e3",
    courseCode: "ECON 101",
    courseName: "Principles of Microeconomics",
    type: "Midterm",
    date: new Date("2026-03-15T00:00:00"),
    time: "7:15 PM - 9:15 PM",
    location: "Grainger Hall",
    reminderSet: false,
    coursePageUrl: "https://canvas.wisc.edu/courses/econ101"
  },
  {
    id: "e4",
    courseCode: "CS 540",
    courseName: "Introduction to Artificial Intelligence",
    type: "Final",
    date: new Date("2026-05-10T00:00:00"),
    time: "10:05 AM - 12:05 PM",
    location: "Humanities 3650",
    reminderSet: false,
    coursePageUrl: "https://canvas.wisc.edu/courses/cs540"
  },
  {
    id: "e5",
    courseCode: "CS 400",
    courseName: "Programming III",
    type: "Final",
    date: new Date("2026-05-12T00:00:00"),
    time: "12:25 PM - 2:25 PM",
    location: "Computer Sciences 1240",
    reminderSet: false,
    coursePageUrl: "https://canvas.wisc.edu/courses/cs400"
  },
  {
    id: "e6",
    courseCode: "STAT 340",
    courseName: "Data Science Modeling I",
    type: "Final",
    date: new Date("2026-05-14T00:00:00"),
    time: "5:05 PM - 7:05 PM",
    location: "Social Sciences 6210",
    reminderSet: false,
    coursePageUrl: "https://canvas.wisc.edu/courses/stat340"
  }
];