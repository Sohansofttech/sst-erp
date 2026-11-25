# SST-ERP — Phase 2: Multi-Division Architectural Entity-Relationship Diagrams

**Document Version:** 1.0  
**Phase:** Phase 2 Technical Planning (Visual Specification)  
**Target Audience:** Single-Developer Full-Stack Implementation Workflow  
**Specification Standard:** Mermaid GFM Syntax  

---

## 1. Master Multi-Division Entity-Relationship Diagram

This diagram displays the complete entity architecture, illustrating how multiple divisions exist under a single parent institution tenant without duplicating core identity or billing subsystems.

```mermaid
erDiagram
    %% Core Tenancy & Divisions
    institutions ||--o{ institution_divisions : "owns multiple"
    institutions ||--o{ users : "hosts"
    institutions ||--o{ academic_years : "schedules"
    institutions ||--o{ fee_structures : "bills"
    institutions ||--o{ CampusInOutLog : "monitors"
    institutions ||--o{ audit_logs : "records"

    %% Division Scoping
    institution_divisions ||--o{ Department : "scopes (optional)"
    institution_divisions ||--o{ Course : "scopes (college only)"
    institution_divisions ||--o{ Class : "groups"
    institution_divisions ||--o{ Student : "currently enrolls"
    institution_divisions ||--o{ enrollments : "tracks"
    institution_divisions ||--o{ staff_division_assignments : "assigns"
    institution_divisions ||--o{ division_memberships : "authorizes"
    institution_divisions ||--o{ fee_structures : "customizes"

    %% Identity & RBAC
    users ||--o| Student : "identifies (1:1)"
    users ||--o| Staff : "identifies (1:1)"
    users ||--o| teachers : "legacy link (1:1)"
    users ||--o{ division_memberships : "holds roles in"

    %% Staff Cross-Division
    Staff ||--o{ staff_division_assignments : "serves in"
    Staff ||--o{ FacultySubjectAssignment : "teaches"
    Staff ||--o{ TimetableSlot : "conducts"
    Staff ||--o{ Section : "heads (class teacher)"

    %% Academic Hierarchy
    Department ||--o{ Course : "offers"
    Course ||--o{ Class : "structures (college)"
    Class ||--o{ Section : "divides into"
    Section ||--o{ Student : "contains"
    Class ||--o{ enrollments : "registers"
    Class ||--o{ TimetableSlot : "schedules"

    %% Student Enrolments & History
    Student ||--o{ enrollments : "has"
    Student ||--o{ StudentEnrollmentHistory : "archives"
    Student ||--o{ StudentAttendance : "logs"
    Student ||--o{ StudentFeeAllocation : "charged"
    Student ||--o{ StudentAssessmentMark : "earns"

    %% Subscriptions (Institution Level)
    institutions ||--o{ InstitutionSubscription : "subscribes"
    SubscriptionPlan ||--o{ InstitutionSubscription : "defines"
    SubscriptionPlan ||--o{ PlanFeature : "entitles"
    PlatformFeature ||--o{ PlanFeature : "specifies"
    institutions ||--o{ Invoice : "invoiced"
    Invoice ||--o{ Payment : "settled"

    %% Entities attributes
    institutions {
        uuid id PK
        string code UK
        string name
        string slug UK
        enum type
        string status
        boolean isActive
    }

    institution_divisions {
        uuid id PK
        uuid institutionId FK
        string name
        string code UK
        string slug UK
        enum type "MONTESSORI, SCHOOL, HIGHER_SECONDARY, COLLEGE, ACADEMY"
        string status
        boolean isDefault
        json academicSettings
    }

    division_memberships {
        uuid id PK
        uuid institutionId FK
        uuid userId FK
        uuid divisionId FK
        string roleCode
        string status
    }

    staff_division_assignments {
        uuid id PK
        uuid institutionId FK
        uuid staffId FK
        uuid divisionId FK
        string designation
        boolean isPrimary
    }

    Class {
        uuid id PK
        uuid institutionId FK
        uuid divisionId FK "NEW"
        uuid courseId FK "Nullable for non-college"
        int semester "Nullable for non-college"
        string gradeLevel "NEW (e.g. Grade 10)"
        uuid academicYearId FK
    }

    Student {
        uuid id PK
        uuid institutionId FK
        uuid divisionId FK "NEW (Current Division)"
        uuid userId FK
        string admissionNumber UK
        string rollNumber UK
        uuid currentClassId FK
        int currentSemester
    }
```

---

## 2. Shared Identity & Multi-Division RBAC Subsystem

This subsystem illustrates how a single user identity is reused across multiple divisions, eliminating duplicate credentials while maintaining isolated authorization barriers.

```mermaid
flowchart TD
    subgraph UserIdentity["Universal User Identity (Table: users)"]
        U["User ID: usr_101\nEmail: principal.sharma@apex.edu\nName: Dr. Ramesh Sharma\nInstitutionId: inst_apex"]
    end

    subgraph DivisionMemberships["Division Memberships (Table: division_memberships)"]
        M1["Membership 1\nDivision: School (Grade 1-10)\nRole: DIVISION_ADMIN / PRINCIPAL\nStatus: ACTIVE"]
        M2["Membership 2\nDivision: Higher Secondary (+1/+2)\nRole: DIVISION_ADMIN\nStatus: ACTIVE"]
        M3["Membership 3\nDivision: College of Engineering\nRole: PROFESSOR (Faculty)\nStatus: ACTIVE"]
    end

    subgraph StaffAssignments["Staff Teaching Workload (Table: staff_division_assignments)"]
        S1["Staff Profile: stf_901\nPrimary Division: School\nDesignation: Senior Principal"]
        S2["Workload Division: College\nDesignation: Adjunct Professor of Physics"]
    end

    U --> M1
    U --> M2
    U --> M3
    U --> S1
    S1 --> S2
```

### Key Architectural Benefits:
1. **Single Login Credentials:** Dr. Sharma logs in once via `/login`. The session JWT contains his verified identity.
2. **Context Switching:** When Dr. Sharma accesses the School Portal, the server validates `M1`. When he switches to College to record physics marks, the server validates `M3`.
3. **No Cross-Contamination:** A user who is only a Teacher in the School division cannot read College examination grades or modify Higher Secondary fee concessions.

---

## 3. Academic Structure Subsystem by Division Type

```mermaid
flowchart LR
    subgraph RootDivision["InstitutionDivision (Table: institution_divisions)"]
        Div["Division Type Selector"]
    end

    subgraph MontessoriFlow["Montessori Flow"]
        M_Stage["Stage / Age Group\n(e.g., Primary 3-6)"] --> M_Group["Group / Cohort"]
        M_Group --> M_Obs["Activity & Developmental Milestones"]
    end

    subgraph SchoolFlow["School Flow (Grades 1-10)"]
        S_Grade["Grade / Standard\n(e.g., Grade 10)"] --> S_Sec["Section\n(e.g., 10-A)"]
        S_Sec --> S_Terms["Terms (Term 1, Term 2)"]
        S_Terms --> S_Marks["Subject Tests & Report Cards"]
    end

    subgraph PUCFlow["Higher Secondary (+1/+2)"]
        P_Stream["Academic Stream\n(Science / Commerce / Arts)"] --> P_Comb["Subject Combination\n(PCMB / PCMC)"]
        P_Comb --> P_Exams["Term Exams & Practical Boards"]
    end

    subgraph CollegeFlow["College Flow (EXISTING)"]
        C_Dept["Department\n(e.g., CSE)"] --> C_Course["Degree Course\n(e.g., B.Tech)"]
        C_Course --> C_Sem["Semester (1 to 8)"]
        C_Sem --> C_SGPA["Credits, SGPA, CGPA & Backlogs"]
    end

    Div -->|type = MONTESSORI| MontessoriFlow
    Div -->|type = SCHOOL| SchoolFlow
    Div -->|type = HIGHER_SECONDARY| PUCFlow
    Div -->|type = COLLEGE| CollegeFlow
```

---

## 4. Student Progression Lifecycle Across Divisions

This diagram shows how a single student progresses through all educational stages under the same institution without data loss or duplicate profiles.

```mermaid
stateDiagram-v2
    [*] --> MontessoriEnrolled: Admission (Age 3)
    
    state MontessoriEnrolled {
        ToddlerStage --> PrimaryStage: Age Progression
        PrimaryStage --> MontessoriGraduated: Milestone Completion
    }

    MontessoriGraduated --> SchoolEnrolled: Transition to Grade 1
    
    state SchoolEnrolled {
        PrimaryWing --> MiddleWing: Standard 1 to 8
        MiddleWing --> SecondaryWing: Standard 9 to 10
        SecondaryWing --> Class10Graduated: 10th Board Pass
    }

    Class10Graduated --> HigherSecondaryEnrolled: Transition to +1
    
    state HigherSecondaryEnrolled {
        StreamSelection: Select Science / Commerce
        PlusOne --> PlusTwo: Year 1 to 2
        PlusTwo --> HighSchoolCompleted: 12th Board Pass
    }

    HighSchoolCompleted --> CollegeEnrolled: Transition to B.Tech / Degree
    
    state CollegeEnrolled {
        Semester1_4: Core Engineering
        Semester5_8: Electives & Projects
        Semester5_8 --> DegreeAwarded: Degree Completion
    }

    DegreeAwarded --> Alumni: Permanent Archive

    note right of MontessoriEnrolled
        Student.divisionId = MONTESSORI_ID
        History logged in StudentEnrollmentHistory
    end note

    note right of SchoolEnrolled
        Student.divisionId = SCHOOL_ID
        Academic records in StudentAssessmentMark
    end note

    note right of CollegeEnrolled
        Student.divisionId = COLLEGE_ID
        Course: B.Tech, Semesters: 1-8
        Historical School records preserved in DB
    end note
```

---

## 5. Centralized Financial & Subscription Subsystem

Shows the complete decoupling of licensing and billing from educational divisions:

```mermaid
flowchart TD
    subgraph PlatformBilling["Platform Billing Layer (PascalCase Tables)"]
        Plan["SubscriptionPlan\nCapacity: 1,500 Students\nPlan: Enterprise Campus Tier"]
        Sub["InstitutionSubscription\nStatus: ACTIVE\nRenews: Annually"]
        Inv["Invoice & Payment\nGateway: Razorpay (INR)"]
        Plan --> Sub
        Sub --> Inv
    end

    subgraph UmbrellaInstitution["Umbrella Institution (Table: institutions)"]
        Inst["Institution: Apex Educational Trust\nTotal Licensed Capacity: 1,500 Students"]
    end

    subgraph DivisionCapacityConsumption["Capacity Distributed Automatically Across Divisions"]
        D_Mont["Montessori Division\nEnrolled: 150 Students"]
        D_Sch["School Division\nEnrolled: 600 Students"]
        D_HS["Higher Secondary Division\nEnrolled: 300 Students"]
        D_Col["College of Engineering\nEnrolled: 400 Students"]
        D_Total["Total Active Students: 1,450 / 1,500 Capacity (VALID)"]
    end

    Sub --> Inst
    Inst --> D_Mont
    Inst --> D_Sch
    Inst --> D_HS
    Inst --> D_Col
    D_Mont --> D_Total
    D_Sch --> D_Total
    D_HS --> D_Total
    D_Col --> D_Total
```

### Key Billing Finding:
The billing capacity check in `lib/billing/student-capacity.ts` calls `countInstitutionStudents(client, institutionId)`. Because it counts students where `institutionId = institutionId`, it **already automatically calculates the sum across all divisions**! Zero billing changes are needed.
