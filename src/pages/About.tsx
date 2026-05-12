import Layout from "@/components/draft/Layout";

const About = () => (
  <Layout>
    <section className="max-w-2xl mx-auto px-6 pt-20 pb-24">
      <p className="label-mono mb-6">— colophon</p>
      <h1 className="font-serif text-5xl text-ink mb-10">about</h1>
      <div className="draft-body space-y-6 text-ink-soft">
        <p className="font-serif text-xl text-ink not-italic">express. explore.</p>
        <p>drafts.rw is a shared room for writers — people who have a piece or two stuck in their
        head and want to share it with the likeminded. it is a place for work still in motion,
        offered without schedule and received without rush.</p>
        <p>post a draft, a fragment, a thought mid-becoming. follow the writers who make you feel
        something. find new voices you didn't know you needed.</p>
        <p>no algorithm choosing what you see. no performance metrics. just the writing, and the
        people doing it.</p>
        <p className="italic">— drafts.rw</p>
      </div>
    </section>
  </Layout>
);

export default About;