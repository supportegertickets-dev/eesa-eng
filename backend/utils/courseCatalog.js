const COURSE_CATALOG = [
  {
    year: 1,
    semesters: {
      1: [
        ['CHEM 111', 'General Inorganic & Physical Chemistry'],
        ['COMP 110', 'Computer Architecture I'],
        ['COMS 111', 'Introduction to Academic Communication Skills'],
        ['EEEN 110', 'Introduction to Electrical and Electronic Engineering'],
        ['MATH 116', 'Introduction to Pure Mathematics'],
        ['MATH 118', 'Applied Geometry'],
        ['MMEN 110', 'Geometrical Drawing'],
        ['PHYS 104', 'Physics for Engineers I']
      ],
      2: [
        ['CHEM 130', 'Introduction to Organic Chemistry'],
        ['COMP 102', 'Introduction to Computer for Scientific Applications'],
        ['EEEN 130', 'Physical Electronics'],
        ['MATH 117', 'Differential Calculus for Engineering'],
        ['MATH 222', 'Integral Calculus for Engineers'],
        ['MMEN 111', 'Engineering Drawing'],
        ['MMEN 120', 'Engineering Materials Science'],
        ['PHYS 105', 'Physics for Engineers II'],
        ['ZOOL 143', 'Biology of HIV/AIDS and Society']
      ]
    }
  },
  {
    year: 2,
    semesters: {
      1: [
        ['AGED 313', 'Technical Report Writing'],
        ['CIEN 211', 'Introduction to Fluid Mechanics'],
        ['MATH 221', 'Vector Calculus & Algebra for Engineering'],
        ['MMEN 210', 'Workshop Technology'],
        ['MMEN 220', 'Computer Aided Drawing (CAD)'],
        ['MMEN 222', 'Machine Elements'],
        ['MMEN 224', 'Introduction to Thermodynamics'],
        ['MMEN 226', 'Solid Mechanics']
      ],
      2: [
        ['CIEN 213', 'Fluid Mechanics: Flow in Pipes'],
        ['COMP 222', 'Assembly Language Programming'],
        ['EEEN 211', 'Circuit Theory'],
        ['EEEN 231', 'Solid State Devices and Circuits'],
        ['EEEN 251', 'Dynamic Systems Modelling'],
        ['EEEN 271', 'Electrical and Electronic Workshop Practice'],
        ['ENSC 100', 'Environmental Studies'],
        ['MATH 223', 'Multivariable Calculus for Engineers'],
        ['EEEN 270', 'Engineering Practice']
      ]
    }
  },
  {
    year: 3,
    semesters: {
      1: [
        ['COMP 313', 'Data Structures & Analysis of Algorithms'],
        ['EEEN 312', 'Electrical Circuits Analysis'],
        ['EEEN 322', 'Electrical and Electronic Instruments'],
        ['EEEN 332', 'Analogue Electronics'],
        ['EEEN 333', 'Digital Electronics'],
        ['AGEN 566', 'Engineering Economy'],
        ['MATH 340', 'Differential Equations for Engineering']
      ],
      2: [
        ['AGEN 312', 'Engineering Design Principles'],
        ['CIEN 512', 'Law, Ethics and Professional Practice'],
        ['EEEN 323', 'Principles of Measurements'],
        ['EEEN 334', 'Analogue Electronic Systems'],
        ['EEEN 335', 'Digital Electronic Systems'],
        ['EEEN 352', 'Linear Control Systems'],
        ['MATH 341', 'Analytical Methods for Engineering'],
        ['EEEN 361', 'Electromagnetics'],
        ['EEEN 370', 'Industrial Attachment I']
      ]
    }
  },
  {
    year: 4,
    semesters: {
      1: [
        ['EEEN 436', 'Power Electronics'],
        ['EEEN 414', 'Induction Machines and Transformers'],
        ['EEEN 462', 'Analogue Communication Systems'],
        ['EEEN 491', 'Introduction to Power Systems'],
        ['EEEN 463', 'Electrodynamics'],
        ['EEEN 453', 'Feedback Control Systems'],
        ['STAT 456', 'Engineering Statistics']
      ],
      2: [
        ['AGEN 462', 'Research Methods'],
        ['EEEN 415', 'Synchronous and DC Machines'],
        ['EEEN 492', 'Power Systems Protection'],
        ['EEEN 441', 'Embedded Systems'],
        ['EEEN 464', 'Digital Communication Systems'],
        ['EEEN 477', 'Electrical and Electronic System Design'],
        ['EEEN 481', 'Project Management'],
        ['MATH 439', 'Numerical Methods for Engineering'],
        ['EEEN 470', 'Industrial Attachment II']
      ]
    }
  },
  {
    year: 5,
    semesters: {
      1: [
        ['EEEN 571', 'Engineering Project Proposal'],
        ['MMEN 550', 'Operations Research'],
        ['EEEN 542', 'Artificial Intelligence'],
        ['EEEN 554', 'Digital Control Systems'],
        ['EEEN 597', 'Renewable Energy'],
        ['EEEN 517', 'Electrical Machine Drives'],
        ['EEEN 593', 'Power Transmission Systems'],
        ['EEEN 595', 'High Voltage Engineering'],
        ['EEEN 525', 'Digital Signal Processing'],
        ['EEEN 565', 'Antennas and Propagation'],
        ['EEEN 567', 'Satellite Communication Systems'],
        ['EEEN 555', 'Nonlinear and Optimal Control Systems'],
        ['EEEN 556', 'Programmable Logic Controllers (PLCs)'],
        ['EEEN 537', 'Analogue Integrated Circuits Design'],
        ['EEEN 538', 'VLSI Design']
      ],
      2: [
        ['AGBM 102', 'Principles of Entrepreneurship'],
        ['EEEN 572', 'Engineering Project Implementation'],
        ['EEEN 543', 'Internet of Things (IoT) and Wireless Sensor Networks'],
        ['EEEN 594', 'Power Systems Analysis'],
        ['EEEN 596', 'Power System Planning'],
        ['EEEN 518', 'Electrical Machine Design'],
        ['EEEN 519', 'Illumination Engineering'],
        ['EEEN 566', 'Microwave Engineering'],
        ['EEEN 527', 'Image Processing'],
        ['EEEN 568', 'Optical Fibre Communications'],
        ['EEEN 569', 'Electroacoustics'],
        ['EEEN 5610', 'Mobile Communication Systems'],
        ['EEEN 557', 'Real-Time Control Systems'],
        ['EEEN 558', 'Human Machine Interfaces'],
        ['EEEN 559', 'Robotics'],
        ['EEEN 546', 'Microprocessors'],
        ['EEEN 544', 'Biomedical Electronics'],
        ['EEEN 545', 'Radiology and Medical Imaging Systems'],
        ['EEEN 539', 'RF Circuit Design']
      ]
    }
  }
];

const SERVICE_UNITS = [
  ['EEEN 216', 'Introduction to Principles of Electrical Engineering'],
  ['EEEN 317', 'Utilization of Electrical Energy'],
  ['EEEN 326', 'Introduction to Instrumentation and Control Engineering']
];

const catalogEntries = COURSE_CATALOG.flatMap(({ year, semesters }) =>
  Object.entries(semesters).flatMap(([semester, units]) =>
    units.map(([code, name]) => ({
      code,
      name,
      year,
      semester: Number(semester),
      folder: `Year ${year}/Semester ${semester}/${code} - ${name}`
    }))
  )
);

const serviceEntries = SERVICE_UNITS.map(([code, name]) => ({
  code,
  name,
  year: null,
  semester: null,
  folder: `Service Courses/${code} - ${name}`
}));

const findCourse = (code, year, semester) => catalogEntries.find(unit =>
  unit.code === code && unit.year === Number(year) && unit.semester === Number(semester)
 ) || serviceEntries.find(unit => unit.code === code && year === 'service');

const findCourseFromText = (text = '', year, semester) => {
  const normalizedText = text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return [...catalogEntries, ...serviceEntries].find(unit => {
    const normalizedCode = unit.code.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const matchesSelection = year === undefined || (
      unit.year === Number(year) && unit.semester === Number(semester)
    );
    return matchesSelection && normalizedText.includes(normalizedCode);
  });
};

const extractUnitCode = (text = '') => {
  const normalizedText = text.toUpperCase().replace(/[-_]+/g, ' ');
  const match = normalizedText.match(/(?:^|[^A-Z0-9])([A-Z]{2,6}\s+\d{3,4})(?=$|[^A-Z0-9])/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
};

module.exports = { COURSE_CATALOG, SERVICE_UNITS, catalogEntries, serviceEntries, findCourse, findCourseFromText, extractUnitCode };
