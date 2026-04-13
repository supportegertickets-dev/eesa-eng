'use client';

import { HiAcademicCap, HiUserGroup, HiLightBulb, HiCog, HiGlobe } from 'react-icons/hi';

export default function AboutPage() {
  const leadership = [
    { role: 'Chairperson', name: 'To Be Updated', department: 'Engineering' },
    { role: 'Vice Chairperson', name: 'To Be Updated', department: 'Engineering' },
    { role: 'Secretary General', name: 'To Be Updated', department: 'Engineering' },
    { role: 'Treasurer', name: 'To Be Updated', department: 'Engineering' },
  ];

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold mb-4">About EESA</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">
            The Egerton Engineering Student Association — fostering engineering excellence since inception.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="card bg-primary-50 border-primary-200">
              <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center mb-4">
                <HiGlobe className="w-6 h-6 text-white" />
              </div>
              <h2 className="font-heading text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
              <p className="text-gray-700 leading-relaxed">
                To provide a dynamic platform for engineering students at Egerton University to 
                develop their technical skills, foster innovation, build professional networks, 
                and engage in community service that demonstrates the transformative power of engineering.
              </p>
            </div>
            <div className="card bg-accent-50 border-accent-200">
              <div className="w-12 h-12 bg-accent-500 rounded-xl flex items-center justify-center mb-4">
                <HiLightBulb className="w-6 h-6 text-white" />
              </div>
              <h2 className="font-heading text-2xl font-bold text-gray-900 mb-4">Our Vision</h2>
              <p className="text-gray-700 leading-relaxed">
                To be the leading student engineering association in East Africa, recognized for 
                producing innovative engineers who are technically competent, socially responsible, 
                and ready to tackle the engineering challenges of tomorrow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Our Core Values</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: HiAcademicCap,
                title: 'Academic Excellence',
                description: 'We strive for the highest standards in engineering education, encouraging continuous learning and intellectual growth.',
              },
              {
                icon: HiUserGroup,
                title: 'Unity & Collaboration',
                description: 'We believe in the power of teamwork, bringing together students from all engineering disciplines to achieve common goals.',
              },
              {
                icon: HiCog,
                title: 'Innovation & Creativity',
                description: 'We encourage creative problem-solving and innovative thinking to address real-world engineering challenges.',
              },
            ].map((value, i) => (
              <div key={i} className="card text-center">
                <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-7 h-7 text-primary-500" />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{value.title}</h3>
                <p className="text-gray-600 text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leadership */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Leadership Team</h2>
            <p className="section-subtitle mx-auto">
              Meet the dedicated leaders driving EESA forward
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {leadership.map((leader, i) => (
              <div key={i} className="card text-center">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <HiUserGroup className="w-10 h-10 text-primary-500" />
                </div>
                <h3 className="font-heading font-semibold text-lg">{leader.name}</h3>
                <p className="text-accent-600 font-medium text-sm">{leader.role}</p>
                <p className="text-gray-500 text-xs mt-1">{leader.department}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Engineering Departments</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'Civil Engineering', desc: 'Building infrastructure that connects communities and drives development.' },
              { name: 'Mechanical Engineering', desc: 'Designing and manufacturing systems that power modern industry.' },
              { name: 'Electrical Engineering', desc: 'Harnessing electrical energy for communication, power, and automation.' },
              { name: 'Agricultural Engineering', desc: 'Applying engineering principles to improve agricultural productivity.' },
              { name: 'Chemical Engineering', desc: 'Transforming raw materials into valuable products through chemical processes.' },
            ].map((dept, i) => (
              <div key={i} className="card hover:border-primary-300 transition-colors">
                <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">{dept.name}</h3>
                <p className="text-gray-600 text-sm">{dept.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
