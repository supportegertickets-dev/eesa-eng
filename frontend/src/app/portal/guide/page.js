'use client';

import Link from 'next/link';
import { HiAcademicCap, HiBookOpen, HiCalendar, HiCash, HiClipboardList, HiInformationCircle, HiLightBulb, HiPhotograph, HiUser, HiUsers, HiBell, HiArrowRight } from 'react-icons/hi';

const sections = [
  {
    icon: HiUser,
    title: '1. Complete your profile',
    description: 'Keep your membership details current so EESA can identify and support you.',
    steps: [
      'Open Profile from the portal menu.',
      'Add or update your name, department, year of study, phone number, and biography.',
      'Upload a clear profile picture using Change profile picture.',
      'Select Save Changes when finished.',
      'Use Change Password to update your password. Enter your current password, a new password, and confirm it.'
    ],
    link: ['/portal/profile', 'Open Profile']
  },
  {
    icon: HiBookOpen,
    title: '2. Find and share learning materials',
    description: 'Use the Library for notes, past papers, textbooks, tutorials, and lab reports, filed by year, semester, and unit.',
    steps: [
      'Open Library and browse the folders: Year, then Semester, then Unit. Inside a unit, choose a type such as Past papers.',
      'Search by title, unit code (for example EEEN 481), or unit name.',
      'Select a file to preview it in the app, including on your phone, then use Download to save it.',
      'To share, select Upload files and add up to 10 files at once. Each file is read to suggest its unit, year, semester, and type. Check the suggestions before uploading.',
      'If a unit is not listed yet, type its code and add its name, year, and semester.',
      'Uploads wait for review before they appear. You are notified when a file is approved or not approved, and can fix it from My uploads.'
    ],
    link: ['/portal/library', 'Open Library']
  },
  {
    icon: HiCalendar,
    title: '3. Follow events',
    description: 'Stay informed about EESA activities and reserve your place when attendance is available.',
    steps: [
      'Open My Events to see upcoming and past events.',
      'Select RSVP on an upcoming event to attend.',
      'Select Cancel RSVP if your plans change.',
      'Event creation, editing, and deletion are reserved for Admin and Chairperson.'
    ],
    link: ['/portal/events', 'View Events']
  },
  {
    icon: HiClipboardList,
    title: '4. Participate in elections',
    description: 'Review active elections, register where permitted, and cast your vote securely.',
    steps: [
      'Open Elections and read the election information and dates.',
      'Review candidate profiles before voting.',
      'Follow the on-screen instructions to register as a candidate when registration is open.',
      'Cast your vote once during the voting period and review results when published.'
    ],
    link: ['/portal/elections', 'Open Elections']
  },
  {
    icon: HiCash,
    title: '5. Pay membership fees',
    description: 'Submit membership payments and monitor their verification status.',
    steps: [
      'Open Payments and choose the available payment option.',
      'Enter the requested transaction details accurately.',
      'Submit the payment and keep your confirmation information.',
      'Return to Payments to check whether your submission is pending, verified, or rejected.'
    ],
    link: ['/portal/payments', 'Open Payments']
  },
  {
    icon: HiBell,
    title: '6. Read notifications',
    description: 'Use notifications for announcements, approvals, and important EESA updates.',
    steps: [
      'Open Notifications from the portal menu.',
      'Select a notification to read its full message.',
      'Use the available controls to mark notifications as read.'
    ],
    link: ['/portal/notifications', 'View Notifications']
  },
  {
    icon: HiPhotograph,
    title: '7. Explore the gallery',
    description: 'Browse photo albums from EESA events and activities. Office holders can also create albums and upload photos.',
    steps: [
      'Open Gallery from the portal menu, then search, filter by category or sort to find an album.',
      'Select a photo to view it full screen. Use the arrow keys or swipe to move between photos, and share or download from the top bar.',
      'Office holders: select New album, then drop in as many photos as you like. Large photos are resized before upload, and you can add captions, reorder photos and choose a cover afterwards.'
    ],
    link: ['/portal/gallery', 'Open Gallery']
  },
  {
    icon: HiLightBulb,
    title: '8. Discover projects',
    description: 'Learn about engineering projects and find opportunities to participate.',
    steps: [
      'Open Projects from the main website navigation.',
      'Read the project description, category, status, and team details.',
      'Use the project participation option when it is available.'
    ],
    link: ['/projects', 'View Projects']
  },
  {
    icon: HiUsers,
    title: '9. Connect with members',
    description: 'Browse the EESA membership directory, find colleagues and see what they contribute.',
    steps: [
      'Open Members from the portal menu.',
      'Search by name or use the department filters to narrow the directory.',
      'Select a member to open their profile: bio, leadership role, projects and approved library uploads.',
      'Contact details stay private. Only administrators can see email addresses, phone numbers and registration numbers.'
    ],
    link: ['/portal/members', 'View Members']
  },
  {
    icon: HiAcademicCap,
    title: '10. Understand your academic status',
    description: 'Your academic year is maintained by the system across the five-year course.',
    steps: [
      'Your year advances automatically after an academic year passes.',
      'Year 5 students are marked Alumni after the next academic-year rollover.',
      'Your current year or Alumni status appears in your profile and the members directory.',
      'Contact an administrator if your academic information needs correction.'
    ],
    link: ['/portal/profile', 'Check Status']
  }
];

export default function GuidePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-primary-600 text-white rounded-2xl p-6 sm:p-8 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <HiInformationCircle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-primary-100 text-sm font-medium mb-1">EESA Member Support</p>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold">Platform Guide</h1>
            <p className="text-primary-100 mt-2 max-w-2xl">Everything you need to manage your membership, find resources, participate in EESA activities, and stay connected.</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <section key={section.title} className="card">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-500/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-primary-600 dark:text-primary-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading text-lg sm:text-xl font-semibold text-strong">{section.title}</h2>
                  <p className="text-muted-fg text-sm mt-1">{section.description}</p>
                  <ol className="mt-4 space-y-2 list-decimal list-inside text-sm text-body">
                    {section.steps.map((step) => <li key={step} className="leading-relaxed">{step}</li>)}
                  </ol>
                  <Link href={section.link[0]} className="inline-flex items-center gap-1.5 mt-5 text-sm font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700 dark:hover:text-primary-200">
                    {section.link[1]} <HiArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
