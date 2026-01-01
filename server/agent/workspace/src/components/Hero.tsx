import { motion } from "framer-motion";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

const Hero = ({ id }: { id?: string }) => {
  return (
    <section id={id} className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary/5 dark:from-background dark:via-background dark:to-primary/5">
      <div className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-5xl lg:text-7xl font-bold tracking-tight bg-gradient-to-r from-foreground to-primary/70 bg-clip-text text-transparent"
              >
                Machine Learning
                <br />
                <span className="text-primary">Engineer</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-xl text-muted-foreground leading-relaxed"
              >
                Building intelligent systems that learn, adapt, and transform data into meaningful insights and actionable intelligence.
              </motion.p>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-wrap gap-4"
            >
              <Button size="lg" className="px-8">
                View Projects
              </Button>
              <Button size="lg" variant="outline" className="px-8">
                Contact Me
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative"
          >
            <Card className="relative p-8 border-2 border-primary/20 dark:border-primary/10 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/5 dark:to-primary/10">
              <CardContent className="p-0 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "80%" }} />
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "65%" }} />
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "90%" }} />
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "70%" }} />
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "85%" }} />
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "75%" }} />
                  </div>
                </div>
                
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                  className="w-full h-32 bg-gradient-to-r from-primary/20 to-primary/5 rounded-lg border border-primary/20 dark:border-primary/10"
                />
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-primary rounded-full animate-pulse" />
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "120px" }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-primary rounded-full animate-pulse" />
                    <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: "100px" }} />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <motion.div
              animate={{
                y: [-10, 10, -10],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute -top-4 -right-4 w-20 h-20 bg-primary/20 rounded-full blur-xl"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;