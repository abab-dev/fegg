import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

const skillsCategories = [
  {
    title: "Machine Learning",
    icon: "🧠",
    skills: [
      { name: "TensorFlow", level: 95 },
      { name: "PyTorch", level: 90 },
      { name: "Scikit-learn", level: 95 },
      { name: "Keras", level: 85 },
      { name: "XGBoost", level: 88 }
    ]
  },
  {
    title: "Deep Learning",
    icon: "⚡",
    skills: [
      { name: "CNN", level: 92 },
      { name: "RNN", level: 88 },
      { name: "Transformer", level: 85 },
      { name: "GAN", level: 80 },
      { name: "Reinforcement Learning", level: 82 }
    ]
  },
  {
    title: "Data Science",
    icon: "📊",
    skills: [
      { name: "Pandas", level: 95 },
      { name: "NumPy", level: 90 },
      { name: "Matplotlib", level: 88 },
      { name: "Seaborn", level: 85 },
      { name: "SQL", level: 85 }
    ]
  },
  {
    title: "Programming",
    icon: "💻",
    skills: [
      { name: "Python", level: 98 },
      { name: "JavaScript", level: 80 },
      { name: "R", level: 75 },
      { name: "C++", level: 70 },
      { name: "Java", level: 72 }
    ]
  }
];

const SkillBar = ({ name, level, index }: { name: string; level: number; index: number }) => {
  return (
    <motion.div
      initial={{ width: 0 }}
      whileInView={{ width: `${level}%` }}
      transition={{ duration: 1.5, delay: index * 0.1 }}
      viewport={{ once: true }}
      className="space-y-2"
    >
      <div className="flex justify-between items-center">
        <span className="font-medium text-sm">{name}</span>
        <Badge variant="outline" className="text-xs">
          {level}%
        </Badge>
      </div>
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          transition={{ duration: 1.5, delay: index * 0.1 + 0.2 }}
          className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
          style={{ transformOrigin: "left" }}
        />
      </div>
    </motion.div>
  );
};

const Skills = ({ id }: { id?: string }) => {
  return (
    <section id={id} className="py-20 bg-gradient-to-b from-muted/5 to-background dark:from-muted/5 dark:to-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-primary/70 bg-clip-text text-transparent">
            Technical Skills
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Expertise in modern machine learning frameworks, programming languages, and data science tools.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {skillsCategories.map((category, categoryIndex) => (
            <motion.div
              key={categoryIndex}
              initial={{ opacity: 0, x: categoryIndex % 2 === 0 ? -50 : 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: categoryIndex * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="h-full border-2 border-transparent hover:border-primary/20 transition-all duration-300">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{category.icon}</div>
                    <CardTitle className="text-2xl">{category.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {category.skills.map((skill, skillIndex) => (
                    <SkillBar
                      key={skillIndex}
                      name={skill.name}
                      level={skill.level}
                      index={skillIndex}
                    />
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Skills;