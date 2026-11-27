import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  BookOpenCheck,
  BriefcaseBusiness,
  Check,
  Cloud,
  Code2,
  Cpu,
  GraduationCap,
  Layers3,
  Network,
  Palette,
  PanelsTopLeft,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ssterp.in"),
  title: "Sohan Soft Tech | Software, ERP & Digital Solutions",
  description:
    "Sohan Soft Tech builds software, connected business systems, automation and digital products, including SST-ERP for education institutions.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Sohan Soft Tech | Software, ERP & Digital Solutions",
    description:
      "Thoughtful software and connected systems for businesses and education institutions.",
    url: "https://ssterp.in",
    siteName: "Sohan Soft Tech",
    type: "website",
    images: ["/sohan_logo.png"],
  },
};

type IconCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const services: IconCard[] = [
  {
    icon: Code2,
    title: "Software development",
    description:
      "Purpose-built software shaped around the way your team works and the problems it needs to solve.",
  },
  {
    icon: PanelsTopLeft,
    title: "Web applications",
    description:
      "Useful, responsive web experiences for customers, teams and the services they rely on.",
  },
  {
    icon: Layers3,
    title: "Business systems",
    description:
      "Bring day-to-day operations, records and team workflows into clearer digital systems.",
  },
  {
    icon: GraduationCap,
    title: "ERP solutions",
    description:
      "Connect institutional and business processes through structured, role-aware platforms.",
  },
  {
    icon: Cpu,
    title: "AI & automation",
    description:
      "Explore practical ways to reduce repetitive work and make information more useful.",
  },
  {
    icon: Cloud,
    title: "Cloud & integrations",
    description:
      "Connect services and information flows so the tools around your work fit together.",
  },
  {
    icon: Palette,
    title: "Digital experience design",
    description:
      "Make complex digital journeys easier to understand, navigate and use.",
  },
];

const industries: IconCard[] = [
  {
    icon: BookOpenCheck,
    title: "Education",
    description:
      "Support colleges, schools, Montessori communities and academies with connected institution workflows.",
  },
  {
    icon: ShoppingBag,
    title: "Commerce & retail",
    description:
      "Bring sales, service and operational tools closer together as business needs evolve.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Professional services",
    description:
      "Help service teams organize the systems and information behind their everyday work.",
  },
  {
    icon: Workflow,
    title: "Growing organizations",
    description:
      "Create practical digital foundations for teams ready to improve how work gets done.",
  },
];

const journey = [
  ["01", "Discover", "Understand people, context and the real need."],
  ["02", "Plan", "Set priorities, scope and a shared direction."],
  ["03", "Design", "Shape clear journeys and useful interfaces."],
  ["04", "Build", "Develop the right product and integrations."],
  ["05", "Test", "Check quality, usability and expected behaviour."],
  ["06", "Launch", "Prepare a considered, supported release."],
  ["07", "Improve", "Learn from use and keep making it better."],
];

const principles = [
  ["01", "Business-first thinking", "Start with the outcome, not the technology."],
  ["02", "Practical technology", "Choose tools that solve real needs and fit the context."],
  ["03", "Connected systems", "Make workflows and information work better together."],
  ["04", "Clear implementation", "Keep decisions, responsibilities and next steps visible."],
  ["05", "Reliable support", "Stay engaged as people begin using what has been built."],
  ["06", "Continuous improvement", "Treat launch as a beginning, not the finish line."],
];

function EcosystemVisual() {
  return (
    <div className={styles.ecosystemVisual} role="img" aria-label="Connected technology ecosystem illustration">
      <div className={styles.visualTopline}>
        <span><span className={styles.statusDot} /> Connected thinking</span>
        <span>SOHAN / SYSTEMS</span>
      </div>
      <svg className={styles.connectionLines} viewBox="0 0 640 500" fill="none" aria-hidden="true">
        <path d="M320 250L146 115M320 250L493 115M320 250L146 385M320 250L493 385" />
        <path d="M146 115C230 153 240 214 320 250M493 115C414 157 410 214 320 250M146 385C230 348 240 287 320 250M493 385C414 348 410 287 320 250" />
        <circle cx="320" cy="250" r="95" />
        <circle cx="146" cy="115" r="5" />
        <circle cx="493" cy="115" r="5" />
        <circle cx="146" cy="385" r="5" />
        <circle cx="493" cy="385" r="5" />
      </svg>
      <div className={`${styles.orbitCard} ${styles.orbitTopLeft}`}>
        <span className={styles.orbitIcon}><Code2 size={17} aria-hidden="true" /></span>
        <span><strong>Digital products</strong><small>Designed for people</small></span>
      </div>
      <div className={`${styles.orbitCard} ${styles.orbitTopRight}`}>
        <span className={styles.orbitIcon}><Workflow size={17} aria-hidden="true" /></span>
        <span><strong>Workflows</strong><small>Connected end to end</small></span>
      </div>
      <div className={styles.ecosystemCore}>
        <span className={styles.coreMark}><Network size={26} strokeWidth={1.5} aria-hidden="true" /></span>
        <strong>Technology<br />with purpose</strong>
        <small>People · systems · progress</small>
      </div>
      <div className={`${styles.orbitCard} ${styles.orbitBottomLeft}`}>
        <span className={styles.orbitIcon}><Blocks size={17} aria-hidden="true" /></span>
        <span><strong>Business systems</strong><small>Built around your work</small></span>
      </div>
      <div className={`${styles.orbitCard} ${styles.orbitBottomRight}`}>
        <span className={styles.orbitIcon}><Sparkles size={17} aria-hidden="true" /></span>
        <span><strong>Automation</strong><small>Less repetition</small></span>
      </div>
      <div className={styles.visualFootnote}>
        <span>STRATEGY</span><i /><span>DESIGN</span><i /><span>ENGINEERING</span>
      </div>
    </div>
  );
}

function ErpInterfacePreview() {
  return (
    <div className={styles.interfaceWrap}>
      <div className={styles.interfaceGlow} />
      <div className={styles.interfaceWindow}>
        <div className={styles.interfaceBar}>
          <div className={styles.windowDots}><i /><i /><i /></div>
          <span>Illustrative SST-ERP workspace</span>
          <span className={styles.previewLabel}>CONCEPT VIEW</span>
        </div>
        <div className={styles.interfaceBody}>
          <aside className={styles.interfaceSidebar} aria-label="Illustrative dashboard navigation">
            <div className={styles.interfaceBrand}>
              <span><Layers3 size={15} aria-hidden="true" /></span>
              <strong>SST-ERP</strong>
            </div>
            <small>WORKSPACE</small>
            <div className={styles.sideItemActive}><PanelsTopLeft size={14} aria-hidden="true" /> Overview</div>
            <div className={styles.sideItem}><UsersRound size={14} aria-hidden="true" /> People</div>
            <div className={styles.sideItem}><BookOpenCheck size={14} aria-hidden="true" /> Academics</div>
            <div className={styles.sideItem}><Workflow size={14} aria-hidden="true" /> Operations</div>
            <div className={styles.sideItem}><ShieldCheck size={14} aria-hidden="true" /> Access & plans</div>
            <div className={styles.sidebarTenant}>
              <span className={styles.tenantGlyph}>I</span>
              <span><strong>Your institution</strong><small>Private workspace</small></span>
            </div>
          </aside>
          <div className={styles.interfaceMain}>
            <div className={styles.interfaceHeading}>
              <div><small>INSTITUTION WORKSPACE</small><strong>A connected view of campus life</strong></div>
              <span className={styles.workspaceBadge}><span /> Institution context</span>
            </div>
            <div className={styles.previewTiles}>
              <div><span className={styles.tileGlyph}><UsersRound size={16} aria-hidden="true" /></span><small>People</small><strong>Students & staff</strong><i /></div>
              <div><span className={styles.tileGlyph}><BookOpenCheck size={16} aria-hidden="true" /></span><small>Learning</small><strong>Academic workflows</strong><i /></div>
              <div><span className={styles.tileGlyph}><Layers3 size={16} aria-hidden="true" /></span><small>Platform</small><strong>Plans & administration</strong><i /></div>
            </div>
            <div className={styles.previewBottom}>
              <div className={styles.workflowPreview}>
                <div className={styles.previewSectionTitle}><strong>Connected workflows</strong><span>Illustrative</span></div>
                <div className={styles.workflowTrack}>
                  <span><i /> Student records</span><b />
                  <span><i /> Academic activity</span><b />
                  <span><i /> Institution services</span>
                </div>
              </div>
              <div className={styles.portalPreview}>
                <div className={styles.previewSectionTitle}><strong>Role-based portals</strong><span><Check size={12} /> Connected</span></div>
                <div className={styles.rolePills}><i>Admin</i><i>Teacher</i><i>Student</i><i>Family</i></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className={styles.previewCaption}>Illustrative interface concept — no live or customer records.</p>
    </div>
  );
}

function WorkConcept() {
  return (
    <div className={styles.workConcept} aria-hidden="true">
      <div className={styles.workConceptHead}><span /><span /><span /><b>SST-ERP / WORKSPACE MAP</b></div>
      <div className={styles.workConceptContent}>
        <div className={styles.workConceptRail}><i /><i /><i /><i /><i /></div>
        <div className={styles.workConceptCanvas}>
          <span className={styles.workCanvasLabel}>INSTITUTION OPERATIONS</span>
          <div className={styles.workNodeMain}><Layers3 size={19} /><b>One institution<br />workspace</b></div>
          <div className={`${styles.workNode} ${styles.workNodeA}`}><UsersRound size={15} /><span>People</span></div>
          <div className={`${styles.workNode} ${styles.workNodeB}`}><BookOpenCheck size={15} /><span>Academics</span></div>
          <div className={`${styles.workNode} ${styles.workNodeC}`}><ShieldCheck size={15} /><span>Access</span></div>
          <div className={`${styles.workNode} ${styles.workNodeD}`}><Workflow size={15} /><span>Operations</span></div>
          <svg viewBox="0 0 440 250" className={styles.workLines} fill="none">
            <path d="M220 125L90 64M220 125L350 64M220 125L90 190M220 125L350 190" />
          </svg>
        </div>
      </div>
      <div className={styles.workConceptFoot}><span>PRODUCT CONCEPT</span><span>EDUCATION MANAGEMENT</span></div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className={styles.site}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="Sohan Soft Tech home">
            <Image src="/sohan_logo.png" alt="" width={46} height={46} priority className={styles.logo} />
            <span className={styles.brandText}><strong>Sohan Soft Tech</strong><small>Technology with purpose</small></span>
          </Link>
          <nav className={styles.nav} aria-label="Main navigation">
            <Link href="#home">Home</Link>
            <Link href="#about">About</Link>
            <Link href="#industries">Solutions</Link>
            <Link href="#services">Services</Link>
            <Link href="#work">Our Work</Link>
            <Link href="#contact">Contact</Link>
          </nav>
          <div className={styles.headerActions}>
            <Link className={styles.headerExplore} href="#erp">Explore SST-ERP <ArrowUpRight size={15} aria-hidden="true" /></Link>
            <Link className={styles.headerPortal} href="/institution">Institution portal <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className={styles.hero} id="home">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.heroEyebrow}><span /> SOFTWARE <i /> SYSTEMS <i /> DIGITAL PRODUCTS</p>
              <h1>Technology that connects <span>every part</span> of your business.</h1>
              <p className={styles.heroText}>
                We bring software, business systems and thoughtful digital experiences together—so people can do their best work with less friction.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.buttonPrimary} href="#industries">Explore our solutions <ArrowRight size={17} aria-hidden="true" /></Link>
                <Link className={styles.buttonGhost} href="/institution">Access Institution Portal <ArrowUpRight size={16} aria-hidden="true" /></Link>
              </div>
              <div className={styles.heroSignature}>
                <span className={styles.signatureLine} />
                <span>Thoughtful engineering. Practical outcomes.</span>
              </div>
            </div>
            <EcosystemVisual />
          </div>
          <div className={styles.heroBottom}>
            <span>From a clear idea</span><i /><span>to connected technology</span>
            <Link href="#about">Discover Sohan Soft Tech <ArrowDownRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className={styles.aboutSection} id="about">
          <div className={styles.sectionContainer}>
            <div className={styles.aboutGrid}>
              <div className={styles.aboutHeading}>
                <p className={styles.kicker}>01 / About Sohan Soft Tech</p>
                <h2>Good technology starts with <em>understanding.</em></h2>
              </div>
              <div className={styles.aboutCopy}>
                <p className={styles.aboutLead}>We turn everyday complexity into digital systems people can understand and use.</p>
                <p>
                  Sohan Soft Tech works across software, design, automation and business technology. We listen first, make the problem clear, then shape a practical solution around the people and work it needs to support.
                </p>
                <p>
                  From a connected education platform to a new digital product, our approach is thoughtful, collaborative and focused on what happens after launch.
                </p>
                <Link className={styles.inlineLink} href="#approach">How we work <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
            <div className={styles.aboutSignature}>
              <div><span>PEOPLE</span><i /><span>PROCESS</span><i /><span>TECHNOLOGY</span></div>
              <p>Start with the real-world need.<br /><strong>Build for what comes next.</strong></p>
              <span className={styles.aboutStamp}>SST<span>®</span></span>
            </div>
          </div>
        </section>

        <section className={styles.servicesSection} id="services">
          <div className={styles.sectionContainer}>
            <div className={styles.sectionIntro}>
              <div><p className={styles.kicker}>02 / Capabilities</p><h2>Tools for your<br /><em>next step.</em></h2></div>
              <p>Bring us a challenge, a workflow or a product idea. We combine the right capabilities to move it forward—without adding technology for its own sake.</p>
            </div>
            <div className={styles.serviceGrid}>
              {services.map(({ icon: Icon, title, description }, index) => (
                <article className={styles.serviceCard} key={title}>
                  <div className={styles.serviceCardTop}><span className={styles.serviceIcon}><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span><span>0{index + 1}</span></div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className={styles.serviceRule} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.erpSection} id="erp">
          <div className={styles.erpBackdrop} aria-hidden="true" />
          <div className={`${styles.sectionContainer} ${styles.erpGrid}`}>
            <div className={styles.erpCopy}>
              <p className={styles.kickerLight}>03 / A connected education platform</p>
              <div className={styles.erpWordmark}><span className={styles.erpMark}><Layers3 size={19} aria-hidden="true" /></span><span>SST-ERP</span><small>EDUCATION MANAGEMENT</small></div>
              <h2>Make room for<br /><em>better learning.</em></h2>
              <p>
                SST-ERP brings institution administration and academic workflows into one role-aware platform, with a separate workspace for each institution.
              </p>
              <div className={styles.erpPills}><span>Colleges</span><span>Schools / Montessori</span><span>Academies</span></div>
              <ul className={styles.erpBenefits}>
                <li><Check size={15} aria-hidden="true" /> Institution administration and subscription management</li>
                <li><Check size={15} aria-hidden="true" /> Role-based portals for institution teams and learners</li>
                <li><Check size={15} aria-hidden="true" /> Workflows shaped around each institution type</li>
              </ul>
              <div className={styles.erpActions}>
                <Link className={styles.buttonWarm} href="/institution">Access Institution Portal <ArrowRight size={16} aria-hidden="true" /></Link>
                <Link className={styles.erpTextLink} href="/super-admin">Super Admin <ArrowUpRight size={14} aria-hidden="true" /></Link>
              </div>
            </div>
            <ErpInterfacePreview />
          </div>
        </section>

        <section className={styles.industriesSection} id="industries">
          <div className={styles.sectionContainer}>
            <div className={styles.sectionIntro}>
              <div><p className={styles.kicker}>04 / Solutions by industry</p><h2>Technology that fits<br /><em>your context.</em></h2></div>
              <p>Different teams have different pressures. We help shape digital systems around the way each organization serves people and gets work done.</p>
            </div>
            <div className={styles.industryGrid}>
              {industries.map(({ icon: Icon, title, description }, index) => (
                <article className={`${styles.industryCard} ${index === 0 ? styles.industryFeatured : ""}`} key={title}>
                  <span className={styles.industryIndex}>0{index + 1} / SOLUTION AREA</span>
                  <span className={styles.industryIcon}><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
                  <h3>{title}</h3><p>{description}</p>
                  <span className={styles.industryArrow}><ArrowUpRight size={17} aria-hidden="true" /></span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.approachSection} id="approach">
          <div className={styles.sectionContainer}>
            <div className={styles.approachHeader}>
              <div><p className={styles.kicker}>05 / Our approach</p><h2>From first question<br />to <em>what’s next.</em></h2></div>
              <p>A considered journey helps teams stay aligned and gives good ideas a clear path into everyday use.</p>
            </div>
            <ol className={styles.journey}>
              {journey.map(([number, title, description], index) => (
                <li className={styles.journeyStep} key={number}>
                  <div className={styles.journeyPoint}><span>{number}</span><i className={index === journey.length - 1 ? styles.lastPoint : ""} /></div>
                  <h3>{title}</h3><p>{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={styles.workSection} id="work">
          <div className={styles.sectionContainer}>
            <div className={styles.workHeader}>
              <div><p className={styles.kicker}>06 / Selected work</p><h2>Built around real<br /><em>institution workflows.</em></h2></div>
              <p>One connected platform for the different people, processes and needs found across education.</p>
            </div>
            <article className={styles.workCard}>
              <div className={styles.workCopy}>
                <span className={styles.workLabel}><span /> FEATURED PRODUCT / EDUCATION</span>
                <h3>SST-ERP</h3>
                <p className={styles.workLead}>A multi-institution education management platform.</p>
                <p>
                  Designed for colleges, schools and Montessori institutions, and academies—with tenant-aware administration, subscriptions and role-based portals.
                </p>
                <div className={styles.workMeta}><span>PRODUCT</span><i /><span>EDUCATION TECHNOLOGY</span><i /><span>WEB PLATFORM</span></div>
                <Link className={styles.inlineLink} href="#erp">Explore the platform <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
              <WorkConcept />
            </article>
          </div>
        </section>

        <section className={styles.whySection}>
          <div className={styles.sectionContainer}>
            <div className={styles.whyGrid}>
              <div className={styles.whyHeading}>
                <p className={styles.kickerLight}>07 / Why Sohan Soft Tech</p>
                <h2>Clear thinking.<br /><em>Considered delivery.</em></h2>
                <p>Technology should make the next step easier to see—and the work behind it easier to do.</p>
                <span className={styles.whySignature}>Sohan Soft Tech <i /> Technology with purpose</span>
              </div>
              <div className={styles.principleList}>
                {principles.map(([number, title, description]) => (
                  <div className={styles.principle} key={number}>
                    <span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><ArrowUpRight size={16} aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.contactSection} id="contact">
          <div className={styles.sectionContainer}>
            <div className={styles.contactPanel}>
              <div className={styles.contactMain}>
                <p className={styles.kicker}>08 / Start a conversation</p>
                <h2>What would you like<br />to <em>make possible?</em></h2>
                <p>Tell us what you’re building, improving or connecting. We’ll help you find a practical next step.</p>
                <div className={styles.contactActions}>
                  <a className={styles.buttonPrimary} href="https://sohansoft.in/contact" target="_blank" rel="noreferrer">Contact Sohan Soft Tech <ArrowUpRight size={16} aria-hidden="true" /></a>
                  <Link className={styles.buttonDarkOutline} href="/institution">Access Institution Portal <ArrowRight size={16} aria-hidden="true" /></Link>
                </div>
              </div>
              <div className={styles.contactDetails}>
                <div className={styles.contactDetail}>
                  <span className={styles.contactRegion}>INDIA ENQUIRIES</span>
                  <strong>Start with your requirement.</strong>
                  <a href="https://sohansoft.in/contact" target="_blank" rel="noreferrer">Open India contact page <ArrowUpRight size={14} aria-hidden="true" /></a>
                </div>
                <div className={styles.contactDetail}>
                  <span className={styles.contactRegion}>UNITED KINGDOM</span>
                  <a href="mailto:info@sohansoft.uk">info@sohansoft.uk</a>
                  <a href="tel:+447716310909">+44 7716 310909</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.sectionContainer}>
          <div className={styles.footerTop}>
            <Link className={styles.brand} href="/" aria-label="Sohan Soft Tech home">
              <Image src="/sohan_logo.png" alt="" width={40} height={40} className={styles.logo} />
              <span className={styles.brandText}><strong>Sohan Soft Tech</strong><small>Technology with purpose</small></span>
            </Link>
            <p>Thoughtful software.<br />Better-connected work.</p>
            <Link className={styles.footerPortal} href="/institution">Institution portal <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className={styles.footerBottom}>
            <span>© Sohan Soft Tech</span>
            <div><Link href="#about">About</Link><Link href="#services">Services</Link><Link href="#work">Our work</Link><a href="https://sohansoft.in/contact" target="_blank" rel="noreferrer">Contact</a></div>
            <nav className={styles.footerPortals} aria-label="Portal access">
              <Link href="/super-admin">Super Admin</Link>
              <Link href="/institution">Institution Admin</Link>
              <Link href="/student">Student</Link>
              <Link href="/teacher">Teacher</Link>
            </nav>
            <span>Software · Systems · Digital products</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
