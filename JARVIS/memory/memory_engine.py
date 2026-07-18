import json
import os

class MemoryEngine:
    def __init__(self, filename="memory.json"):
        self.filename = filename
        self.memory = self.load_memory()

    def load_memory(self):
        if os.path.exists(self.filename):
            with open(self.filename, "r") as f:
                return json.load(f)
        return {}

    def save_memory(self):
        with open(self.filename, "w") as f:
            json.dump(self.memory, f, indent=4)

    def remember(self, key, value):
        self.memory[key] = value
        self.save_memory()

    def recall(self, key):
        return self.memory.get(key, "I don't remember that yet.")

    def forget(self, key):
        if key in self.memory:
            del self.memory[key]
            self.save_memory()