import Hero from "~/components/Hero";
import Projects from "~/components/Projects";
import Skills from "~/components/Skills";
import Contact from "~/components/Contact";
import Navigation from "~/components/Navigation";

function App() {
  return (
    <main className="min-h-screen">
      <Navigation />
      <Hero id="hero" />
      <Projects id="projects" />
      <Skills id="skills" />
      <Contact id="contact" />
    </main>
  );
}

export default App;
