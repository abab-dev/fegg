import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

const projects = [
  {
    title: "Computer Vision Classifier",
    description: "Advanced image classification model using CNN architectures for real-time object detection and classification with 98.5% accuracy.",
    technologies: ["TensorFlow", "PyTorch", "OpenCV", "CNN"],
    image: "gradient-to-br from-blue-500 to-purple-600"
  },
  {
    title: "Natural Language Processing",
    description: "Bert-based sentiment analysis system processing 10M+ documents with multi-language support and real-time inference.",
    technologies: ["Transformers", "BERT", "Hugging Face", "NLTK"],
    image: "gradient-to-br from-green-500 to-teal-600"
  },
  {
    title: "Reinforcement Learning",
    description: "Deep Q-Learning agent trained to play complex strategy games with adaptive policy optimization and self-improvement.",
    technologies: ["Deep Q-Learning", "PyTorch", "Gym", "PPO"],
    image: "gradient-to-br from-red-500 to-pink-600"
  },
  {
    title: "Time Series Forecasting",
    description: "LSTM-based prediction model for financial forecasting with 95% accuracy on multi-step ahead predictions.",
    technologies: ["LSTM", "Prophet", "ARIMA", "Scikit-learn"],
    image: "gradient-to-br from-indigo-500 to-blue-600"
  }
];

const Projects = ({ id }: { id?: string }) => {
  return (
    <section id={id} className="py-20 bg-gradient-to-b from-background to-muted/5 dark:from-background dark:to-muted/5">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-primary/70 bg-clip-text text-transparent">
            Featured Projects
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Exploring cutting-edge machine learning algorithms and deploying them to solve real-world problems.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-8">
          {projects.map((project, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group"
            >
              <Card className="h-full border-2 border-transparent hover:border-primary/20 dark:hover:border-primary/10 transition-all duration-300 hover:shadow-xl">
                <CardHeader className="p-0">
                  <motion.div
                    className={`h-48 rounded-t-lg ${project.image} relative overflow-hidden`}
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </motion.div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <CardTitle className="text-2xl mb-2">{project.title}</CardTitle>
                    <p className="text-muted-foreground leading-relaxed">
                      {project.description}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {project.technologies.map((tech, techIndex) => (
                      <Badge
                        key={techIndex}
                        variant="secondary"
                        className="text-xs"
                      >
                        {tech}
                      </Badge>
                    ))}
                  </div>
                  
                  <Button variant="outline" className="w-full group-hover:bg-primary/10 transition-colors">
                    View Details
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;