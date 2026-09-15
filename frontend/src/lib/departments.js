import { FaBolt, FaCogs, FaHardHat, FaIndustry, FaTractor } from 'react-icons/fa';

/**
 * Department profiles for the public /departments pages.
 *
 * `name` must match the department values in backend/models/User.js, so a
 * member's department can be linked to its page with departmentHref(). The
 * "Other" option has no page.
 */

const ENGINEER_REGISTRATION =
  'Graduates of accredited programmes can register with the Engineers Board of Kenya (EBK) as graduate engineers, '
  + 'then work towards Professional Engineer status through supervised practice. Membership of the Institution of '
  + 'Engineers of Kenya (IEK) supports that journey with mentorship, training and a professional network.';

export const DEPARTMENT_PROFILES = [
  {
    slug: 'civil-engineering',
    name: 'Civil Engineering',
    icon: FaHardHat,
    tagline: 'Designing the infrastructure communities depend on.',
    summary: 'Roads, bridges, buildings, water supply and sanitation: planning, designing and building the environment we live in.',
    overview: [
      'Civil engineering is the oldest of the engineering disciplines and the one people meet most often: the roads they travel on, the water that reaches their taps and the buildings they live and work in. Civil engineers plan, design, build and maintain this infrastructure, balancing safety, cost and environmental impact.',
      'Students build a foundation in mathematics, mechanics and materials before moving into structural, geotechnical, water and transportation engineering. Coursework is paired with laboratory testing, surveying fieldwork and design exercises, and a final-year project brings those skills together on a real-world problem.',
      'In Kenya the discipline sits at the centre of national development, from affordable housing and road networks to irrigation schemes and urban water supply, so civil engineers are needed across both the public and private sectors.',
    ],
    focusAreas: [
      { title: 'Structural Engineering', description: 'Analysing and designing buildings, bridges and other structures in concrete, steel and timber so they carry their loads safely.' },
      { title: 'Geotechnical Engineering', description: 'How soil and rock behave, and how to design the foundations, slopes and retaining walls everything else stands on.' },
      { title: 'Water & Environmental Engineering', description: 'Hydraulics, hydrology, water supply, wastewater treatment and flood control.' },
      { title: 'Transportation Engineering', description: 'Planning, designing and maintaining roads, pavements, junctions and traffic systems.' },
      { title: 'Surveying & Geomatics', description: 'Measuring and mapping land with total stations, GPS and GIS to set out and monitor construction.' },
      { title: 'Construction Management', description: 'Estimating, scheduling, contracts and site safety: turning a design into a finished project.' },
    ],
    coursework: [
      'Engineering mathematics and mechanics',
      'Strength of materials',
      'Structural analysis and design',
      'Soil mechanics and foundation engineering',
      'Fluid mechanics and hydraulics',
      'Engineering surveying',
      'Highway and transportation engineering',
      'Construction materials and management',
      'Engineering drawing and CAD',
    ],
    practicals: [
      'Concrete mix design and cube strength testing',
      'Soil classification and compaction tests',
      'Surveying field practice',
      'Hydraulics laboratory experiments',
      'Industrial attachment with a contractor or consultant',
      'Final-year design or research project',
    ],
    careers: [
      'Structural engineer',
      'Site or resident engineer',
      'Water and sanitation engineer',
      'Highway engineer',
      'Geotechnical engineer',
      'Construction project manager',
      'Cost engineer',
      'Consulting engineer',
    ],
    sectors: [
      'Consulting engineering firms',
      'Building and road contractors',
      'National and county government',
      'Road and water agencies',
      'Housing and real estate developers',
      'NGOs and development agencies',
    ],
    pathway: ENGINEER_REGISTRATION,
    projectIdeas: [
      'Enter a bridge-building or structural design competition as a team.',
      'Design a footbridge, water tank or rainwater harvesting system for a nearby community.',
      'Survey and map part of campus to practise with real instruments and GIS.',
    ],
  },
  {
    slug: 'mechanical-engineering',
    name: 'Mechanical Engineering',
    icon: FaCogs,
    tagline: 'Turning energy and motion into machines that work.',
    summary: 'Machines, engines, manufacturing and energy systems: designing and making the things that move and produce.',
    overview: [
      'Mechanical engineering is one of the broadest engineering disciplines. Mechanical engineers design, analyse, manufacture and maintain anything that moves or uses energy, from vehicle engines and pumps to power plants, production lines and medical devices.',
      'Students are grounded in mechanics, thermodynamics, fluid mechanics and materials science, then apply them to machine design, manufacturing and energy conversion. Workshop practice, laboratory experiments and computer-aided design run alongside the theory, so graduates can both calculate how a part will behave and make it.',
      'With growth in Kenyan manufacturing, agro-processing and renewable energy, mechanical engineers are needed wherever equipment has to be designed, installed, run efficiently or kept in service.',
    ],
    focusAreas: [
      { title: 'Machine Design', description: 'Designing components and mechanisms, from gears and shafts to complete machines, that are strong, reliable and practical to make.' },
      { title: 'Thermofluids & Energy', description: 'Thermodynamics, heat transfer and fluid flow applied to engines, boilers, turbines, refrigeration and air conditioning.' },
      { title: 'Manufacturing & Production', description: 'Machining, casting, welding and fabrication, and how to organise production efficiently.' },
      { title: 'Materials Engineering', description: 'How metals, polymers and composites behave, and how to choose and treat them for a job.' },
      { title: 'Automotive Engineering', description: 'Vehicle systems, engines and power trains, and the shift towards electric mobility.' },
      { title: 'Mechatronics & Control', description: 'Combining mechanisms with sensors, actuators and controllers to build automated systems.' },
    ],
    coursework: [
      'Engineering mechanics: statics and dynamics',
      'Thermodynamics and heat transfer',
      'Fluid mechanics',
      'Strength of materials',
      'Machine design',
      'Manufacturing technology',
      'Materials science',
      'Theory of machines and vibrations',
      'Control engineering',
      'Engineering drawing and CAD/CAM',
    ],
    practicals: [
      'Workshop practice in machining, welding and fitting',
      'Engine and thermodynamics laboratory tests',
      'Fluid mechanics experiments',
      'CAD modelling and simulation',
      'Industrial attachment in manufacturing or energy',
      'Final-year design-and-build project',
    ],
    careers: [
      'Design engineer',
      'Plant or maintenance engineer',
      'Production engineer',
      'Energy engineer',
      'Automotive engineer',
      'Building services (HVAC) engineer',
      'Quality engineer',
      'Technical sales engineer',
    ],
    sectors: [
      'Manufacturing and agro-processing',
      'Power generation: geothermal, hydro, thermal and solar',
      'Vehicle assembly and servicing',
      'Oil, gas and fuel distribution',
      'Construction and building services',
      'Research institutions',
    ],
    pathway: ENGINEER_REGISTRATION,
    projectIdeas: [
      'Build a go-kart or small vehicle for a student design challenge.',
      'Design a low-cost machine for a local workshop or farm, such as a thresher or feed mixer.',
      'Develop a solar dryer or fuel-efficient cookstove with a nearby community.',
    ],
  },
  {
    slug: 'electrical-engineering',
    name: 'Electrical Engineering',
    icon: FaBolt,
    tagline: 'Powering, connecting and automating the modern world.',
    summary: 'Power systems, electronics, communications and control: generating electrical energy and putting it to work.',
    overview: [
      'Electrical engineers work with electricity in all its forms: generating it, moving it across the grid, and using it to drive machines, process information and communicate. The field runs from high-voltage transmission lines to the microchips inside a phone.',
      'Students begin with circuit theory, electromagnetism and electronics, then branch into power systems, electrical machines, telecommunications and control. Laboratory sessions build practical skill with instruments, circuits, microcontrollers and machines, and programming runs through the whole course.',
      'Kenya\'s generation from geothermal, wind and solar, rural electrification and the rapid growth of mobile and digital services all depend on electrical engineers to design, build and run them.',
    ],
    focusAreas: [
      { title: 'Power Systems', description: 'Generating, transmitting and distributing electricity, and protecting the grid so supply stays reliable.' },
      { title: 'Electronics', description: 'Analogue and digital circuits, semiconductor devices and the design of electronic hardware.' },
      { title: 'Telecommunications', description: 'Signal processing and the radio, fibre-optic and mobile networks that carry voice and data.' },
      { title: 'Control & Automation', description: 'Feedback systems, PLCs and instrumentation that keep industrial processes running automatically.' },
      { title: 'Renewable Energy', description: 'Solar, wind and mini-grid systems, and how to connect them safely to the grid.' },
      { title: 'Embedded Systems', description: 'Programming microcontrollers that sense, decide and act: the basis of IoT devices.' },
    ],
    coursework: [
      'Circuit theory and network analysis',
      'Electromagnetic fields',
      'Analogue and digital electronics',
      'Electrical machines',
      'Power systems analysis and protection',
      'Signals and systems',
      'Telecommunications',
      'Control systems',
      'Microprocessors and embedded systems',
      'Programming for engineers',
    ],
    practicals: [
      'Building and measuring circuits with laboratory instruments',
      'Electrical machine and transformer tests',
      'Microcontroller and PLC programming',
      'Electrical installation and wiring practice',
      'Industrial attachment with a utility, telco or manufacturer',
      'Final-year hardware or software project',
    ],
    careers: [
      'Power systems engineer',
      'Electronics design engineer',
      'Telecommunications engineer',
      'Control and instrumentation engineer',
      'Renewable energy engineer',
      'Embedded systems developer',
      'Protection engineer',
      'Electrical building services engineer',
    ],
    sectors: [
      'Electricity generation, transmission and distribution',
      'Telecommunications and internet providers',
      'Renewable energy developers',
      'Manufacturing and process industries',
      'Electronics and IoT start-ups',
      'Government and regulatory agencies',
    ],
    pathway: ENGINEER_REGISTRATION,
    projectIdeas: [
      'Build a solar-powered lighting or phone-charging system for a school.',
      'Design a smart energy meter or home automation system.',
      'Enter a robotics or embedded systems competition.',
    ],
  },
  {
    slug: 'agricultural-engineering',
    name: 'Agricultural Engineering',
    icon: FaTractor,
    tagline: 'Engineering solutions for food, water and the land.',
    summary: 'Farm machinery, irrigation, soil and water conservation and post-harvest processing: engineering for agriculture.',
    overview: [
      'Agricultural engineering applies engineering to producing food and managing natural resources. Agricultural engineers design farm machinery, plan irrigation and drainage systems, conserve soil and water, and develop ways to store and process produce so less of it goes to waste.',
      'The course combines core engineering science with soil science, hydrology and crop production. Students learn to work across both fields: sizing a pump for an irrigation scheme, testing a tractor implement, or designing a store that keeps a harvest safe.',
      'Agriculture remains a cornerstone of Kenya\'s economy, and Egerton University\'s agricultural heritage makes it a natural home for the discipline. Mechanisation, climate-smart irrigation and value addition are all areas where agricultural engineers make a direct difference to farmers\' livelihoods.',
    ],
    focusAreas: [
      { title: 'Farm Power & Machinery', description: 'Tractors, implements and harvesting equipment: their design, testing, selection and maintenance.' },
      { title: 'Soil & Water Engineering', description: 'Irrigation, drainage, soil conservation and water harvesting for productive, sustainable land use.' },
      { title: 'Post-Harvest & Food Engineering', description: 'Drying, storage, processing and cold chains that cut losses and add value to produce.' },
      { title: 'Agricultural Structures', description: 'Greenhouses, animal housing, silos and stores designed for their climate and use.' },
      { title: 'Energy for Agriculture', description: 'Solar pumping, biogas and biomass systems for farms and rural communities.' },
      { title: 'Precision Agriculture', description: 'Sensors, GIS and data used to apply water, seed and fertiliser only where they are needed.' },
    ],
    coursework: [
      'Engineering mechanics and materials',
      'Soil mechanics and soil physics',
      'Hydrology and hydraulics',
      'Irrigation and drainage engineering',
      'Farm power and machinery',
      'Soil and water conservation',
      'Post-harvest and food process engineering',
      'Agricultural structures',
      'Surveying and GIS',
      'Renewable energy systems',
    ],
    practicals: [
      'Tractor operation and machinery testing',
      'Irrigation system design and field layout',
      'Soil and water laboratory analysis',
      'Post-harvest processing trials',
      'Industrial attachment with an agricultural or water organisation',
      'Final-year project on a farm or community problem',
    ],
    careers: [
      'Irrigation engineer',
      'Farm machinery engineer',
      'Soil and water conservation engineer',
      'Food process engineer',
      'Water resources engineer',
      'Agricultural development officer',
      'Agricultural equipment specialist',
      'Researcher',
    ],
    sectors: [
      'Irrigation and water resource agencies',
      'Agricultural machinery manufacturers and dealers',
      'Food processing companies',
      'Agricultural research institutes',
      'County agriculture departments',
      'NGOs, development agencies and large farms',
    ],
    pathway: ENGINEER_REGISTRATION,
    projectIdeas: [
      'Design a low-cost drip irrigation kit for smallholder farmers.',
      'Build a solar-powered grain or fruit dryer.',
      'Prototype a planter, weeder or maize sheller for a local farm.',
    ],
  },
  {
    slug: 'industrial-technology',
    name: 'Industrial Technology',
    icon: FaIndustry,
    tagline: 'Bridging engineering and production on the factory floor.',
    summary: 'Production systems, quality, automation and operations: applying technology so industry runs efficiently.',
    overview: [
      'Industrial technology is about how products are actually made, and how production can be made better. It brings together manufacturing processes, automation, quality control and management so that industries produce good products safely, efficiently and at a competitive cost.',
      'The programme is strongly hands-on. Alongside technical subjects such as manufacturing processes, electrical and mechanical systems and computer-aided design, students study production planning, quality assurance, maintenance and occupational safety, preparing them to lead teams on the shop floor.',
      'As Kenya expands its manufacturing base and industrial parks, industrial technologists are needed to set up production lines, keep equipment running, raise quality and make operations leaner.',
    ],
    focusAreas: [
      { title: 'Manufacturing Processes', description: 'Machining, fabrication, casting and plastics, and choosing the right process for a product.' },
      { title: 'Production & Operations', description: 'Planning and scheduling people, machines and materials for the best output.' },
      { title: 'Quality Assurance', description: 'Inspection, statistical process control and quality management standards such as ISO 9001.' },
      { title: 'Industrial Automation', description: 'PLCs, robotics, sensors and CNC machines that automate production.' },
      { title: 'Maintenance Management', description: 'Preventive and predictive maintenance that keeps plant reliable and cuts downtime.' },
      { title: 'Health, Safety & Environment', description: 'Occupational safety, risk assessment and cleaner production in industrial settings.' },
    ],
    coursework: [
      'Manufacturing technology',
      'Technical drawing and CAD/CAM',
      'Electrical and electronic technology',
      'Mechanical systems and materials',
      'Production planning and control',
      'Quality control and statistics',
      'Industrial automation and PLCs',
      'Maintenance management',
      'Occupational health and safety',
      'Industrial management and entrepreneurship',
    ],
    practicals: [
      'Workshop training in machining, welding and fabrication',
      'CNC programming and operation',
      'PLC and automation laboratory work',
      'Quality inspection and precision measurement',
      'Industrial attachment in a manufacturing plant',
      'Final-year production or process improvement project',
    ],
    careers: [
      'Production supervisor or manager',
      'Quality assurance officer',
      'Maintenance technologist',
      'Automation technologist',
      'Operations and supply chain analyst',
      'Health and safety officer',
      'Technical trainer',
      'Manufacturing entrepreneur',
    ],
    sectors: [
      'Manufacturing and processing plants',
      'Food, beverage and packaging industries',
      'Textile and apparel industries',
      'Energy and utilities',
      'Technical and vocational training institutions',
      'Quality certification and consultancy',
    ],
    pathway:
      'Graduates can seek registration with the Engineers Board of Kenya (EBK) as engineering technologists, and often add '
      + 'professional certifications in quality management, occupational safety or project management as their careers grow.',
    projectIdeas: [
      'Run a lean manufacturing or process improvement study with a local business.',
      'Build a small automated sorting or packaging line controlled by a PLC.',
      'Set up a fabrication space where other EESA teams can prototype their projects.',
    ],
  },
];

export const departmentPath = (slug) => `/departments/${slug}`;

export const getDepartment = (slug) => DEPARTMENT_PROFILES.find((department) => department.slug === slug) || null;

/** Page for a member's department name, or null for "Other" and unknown values. */
export const departmentHref = (name) => {
  const department = DEPARTMENT_PROFILES.find((profile) => profile.name === name);
  return department ? departmentPath(department.slug) : null;
};
