/**
 * Parse Server Database Schema descriptions partitioned for agent specialization.
 */

export const USERS_SCHEMA = `
**_User** — System users
Fields: objectId, username, email, phone, fullname, firstName, lastName, type, profileUrl, stripeCustomerId, deviceId, autoId
`;

export const PATIENTS_SCHEMA = `
**Patients** — Patient medical records
Fields: objectId, uid, fullname, gender, nationality, bloodType, heartRate, bloodPressure, glucoseLevel, allergies, medications, profileUrl, dateOfBirth, email, phonenumber, preExistingConditions, countryOfResidence, cityOfResidence, address, weight (Number), height (Number), documentUrl, isPregnant (Boolean)

**PatientFamilyMembers** — Patient family members
Fields: objectId, patientUid, relation, gender, dateOfBirth, fullname
`;

export const DOCTORS_SCHEMA = `
**Doctors** — Doctor profiles
Fields: objectId, uid, fullname, fullnameAr, title, positionEn, positionAr, qualificationsEn, qualificationsAr, yrsExp (Number), gender, profileUrl, averageRating (Number, default 0), email, phonenumber, isDeleted (Boolean), rank (Number), facebookUrl, instagramUrl, linkedinUrl
`;

export const HOSPITALS_SCHEMA = `
**Hospitals** — Hospital/clinic locations
Fields: objectId, uid, nameEn, nameAr, hospitalType, descEn, descAr, addressEn, addressAr, workingDaysHrs (Number), portfolioFileUrl, facebookUrl, instagramUrl, linkedinUrl, longitude (Number), latitude (Number), areaId, profileUrl, isDeleted (Boolean), rank (Number)

**Cities** — City records
Fields: objectId, nameEn, nameAr, isDeleted (Boolean)

**Areas** — Area/district records
Fields: objectId, nameEn, nameAr, cityId, isDeleted (Boolean)
`;

export const SPECIALTIES_SCHEMA = `
**Specialties** — Medical specialties
Fields: objectId, nameEn, nameAr, imageUrl, isDeleted (Boolean)

**HospitalDoctorSpecialty** — Links doctors to hospitals and specialties
Fields: objectId, hospitalUid, doctorUid, specialtyUid, isDeleted (Boolean)
Pointers: doctorDetails → Doctors, hospitalDetails → Hospitals, specialtyDetails → Specialties

**DoctorAppointments** — Doctor availability/schedule slots
Fields: objectId, hospitalUid, doctorUid, timeSlots (Array), sessionDuration (Number), every, startDate (Date), day, isDeleted (Boolean), isOnline (Boolean), price (Number), currency
Pointers: hospitalDetails → Hospitals, doctorDetails → Doctors
`;

export const BOOKINGS_SCHEMA = `
**PatientsBookings** — Patient appointment bookings
Fields: objectId, patientUid, doctorUid, hospitalUid, bookingDate (Date), slot, status (String: "confirmed","cancelled","completed","pending"), cancelledBy, isReviewed (Boolean), isOnline (Boolean), isVideoLinkGenerated (Boolean), packageUid, currency, isPackage (Boolean), sessionType, sessionIndex (Number), price (Number), paid (Number), packageInstanceUid, endAt (Date)
Pointers: doctorDetails → Doctors, patientDetails → Patients, hospitalDetails → Hospitals, packageDetails → Packages

**DoctorsReviews** — Patient reviews for doctors
Fields: objectId, patientUid, doctorUid, review, rating (Number), patientFullName, patientProfileUrl, appointmentUid, hospitalUid, isApproved (Boolean)

**Payments** — Payment transactions
Fields: objectId, amount, paymentId, paymentType, stripeCustomerId, paymentMethodId, currency, packageInstanceUid, patientUid, cardLast4, cardBrand
Pointers: patientBooking → PatientsBookings
`;

export const PACKAGES_SCHEMA = `
**Packages** — Medical service packages
Fields: objectId, price (Number), currency, hospitalUid, detailsEn, detailsAr, procedureEn, procedureAr, timeframeEn, timeframeAr, paymentPercentage (Number), isDeleted (Boolean), isAssigned (Boolean)
Pointers: hospitalDetails → Hospitals

**HospitalDoctorPackages** — Links packages to doctors and hospitals
Fields: objectId, hospitalUid, doctorUid, packageUid, isDeleted (Boolean)
Pointers: hospitalDetails → Hospitals, doctorDetails → Doctors, packageDetails → Packages
`;

export const SYMPTOM_AGENT_SCHEMA = `
Available database classes for symptom & doctor matching:

${SPECIALTIES_SCHEMA}

${DOCTORS_SCHEMA}

${HOSPITALS_SCHEMA}
`;

export const SEARCH_AGENT_SCHEMA = `
Available database classes for direct search:

${DOCTORS_SCHEMA}

${HOSPITALS_SCHEMA}

${PACKAGES_SCHEMA}

${SPECIALTIES_SCHEMA}

**DoctorsReviews** — Patient reviews for doctors
Fields: objectId, patientUid, doctorUid, review, rating (Number), patientFullName, patientProfileUrl, appointmentUid, hospitalUid, isApproved (Boolean)
`;

export const PROFILE_AGENT_SCHEMA = `
Available database classes for logged-in patient profile & bookings:

${PATIENTS_SCHEMA}

${BOOKINGS_SCHEMA}

${USERS_SCHEMA}
`;
