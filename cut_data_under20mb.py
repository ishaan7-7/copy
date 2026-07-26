import os

SOURCE_DIR = r"C:\streaming_emulator\data\vehicles"
TARGET_DIR = r"C:\streaming_emulator\cut_data\vehicles"
MAX_BYTES = 20 * 1024 * 1024

def process_files():
    if not os.path.exists(SOURCE_DIR):
        print(f"Error: Source directory {SOURCE_DIR} not found. Check your path.")
        return

    for sim_folder in os.listdir(SOURCE_DIR):
        sim_path = os.path.join(SOURCE_DIR, sim_folder)

        if os.path.isdir(sim_path):
            target_sim_path = os.path.join(TARGET_DIR, sim_folder)
            os.makedirs(target_sim_path, exist_ok=True)

            for filename in os.listdir(sim_path):
                if filename.endswith('.csv'):
                    source_file = os.path.join(sim_path, filename)
                    target_file = os.path.join(target_sim_path, filename)
                    cut_file_to_size(source_file, target_file)

def cut_file_to_size(source_path, target_path):
    current_bytes = 0

    with open(source_path, 'r', encoding='utf-8') as infile, \
         open(target_path, 'w', encoding='utf-8', newline='') as outfile:

        for line in infile:
            line_bytes = len(line.encode('utf-8'))
            
            if current_bytes + line_bytes > MAX_BYTES:
                break

            outfile.write(line)
            current_bytes += line_bytes

    print(f"Successfully processed: {target_path} - Size: {current_bytes / (1024 * 1024):.2f} MB")

if __name__ == "__main__":
    print("Starting data truncation...")
    process_files()
    print("Process complete.")