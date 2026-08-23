#!/usr/bin/env python3
"""
OHR Batch TTS Generator
Overwatch Horse Racing - Ana's Commentary Batch Audio Generator

This script reads the simplified JSON and automatically generates
TTS audio files for all voicelines, organizing them into category folders.
"""

import json
import sys
import os
import re
from pathlib import Path
from typing import Dict
import time

# Add parent directory to path to import from main XTTS project
sys.path.append(str(Path(__file__).parent.parent))

# Import dependencies with fallback handling
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("❌ PyTorch not available")

try:
    from TTS.api import TTS
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False
    print("❌ TTS library not available")

def create_progress_bar(current: int, total: int, width: int = 50) -> str:
    """Create a simple progress bar."""
    if total == 0:
        return "[" + "=" * width + "] 100%"
    
    progress = current / total
    filled = int(width * progress)
    bar = "=" * filled + "-" * (width - filled)
    percentage = int(progress * 100)
    
    return f"[{bar}] {percentage:3d}% ({current}/{total})"

class OHRBatchTTSGenerator:
    def __init__(self):
        """Initialize the batch TTS generator."""
        self.base_dir = Path(__file__).parent
        self.json_file = self.base_dir / "ana_commentary_master.json"
        self.parent_dir = self.base_dir.parent  # Main XTTS project directory
        
        # Voice settings
        self.ana_voice_file = None
        self.tts_model = None
        self.is_model_loaded = False
        
        print("🎯 OHR Batch TTS Generator")
        print("=" * 50)

    def _check_dependencies(self) -> bool:
        """Check if required dependencies are available."""
        print("🔍 Checking dependencies...")
        
        if not TORCH_AVAILABLE:
            print("❌ PyTorch is not installed")
            return False
        
        if not TTS_AVAILABLE:
            print("❌ TTS library is not installed")
            return False
        
        print("✅ Dependencies check passed")
        return True

    def _find_ana_voice(self) -> bool:
        """Find Ana's voice file from the main project."""
        print("🔍 Looking for Ana's voice file...")
        
        # Check the main voices directory
        voices_dir = self.parent_dir / "voices"
        if not voices_dir.exists():
            print(f"❌ Voices directory not found: {voices_dir}")
            return False
        
        # Look for Ana-related voice files
        possible_names = ["ana", "amari", "mother", "sniper"]
        voice_extensions = [".wav", ".mp3", ".flac"]
        
        for voice_file in voices_dir.iterdir():
            if voice_file.suffix.lower() in voice_extensions:
                filename_lower = voice_file.stem.lower()
                for name in possible_names:
                    if name in filename_lower:
                        self.ana_voice_file = voice_file
                        print(f"✅ Found Ana voice: {voice_file.name}")
                        return True
        
        # If no Ana voice found, use any available voice
        voice_files = []
        for ext in voice_extensions:
            voice_files.extend(voices_dir.glob(f"*{ext}"))
        
        if voice_files:
            self.ana_voice_file = voice_files[0]
            print(f"⚠️  No Ana voice found, using: {voice_files[0].name}")
            return True
        
        print("❌ No voice files found in voices directory")
        print("💡 Please add a voice file to the main project's voices/ folder using the XTTS CLI")
        return False

    def _load_tts_model(self) -> bool:
        """Load the XTTS model."""
        if self.is_model_loaded:
            return True
        
        print("⏳ Loading XTTS model...")
        
        try:
            cuda_available = torch.cuda.is_available()
            if cuda_available:
                print(f"🚀 Using CUDA acceleration: {torch.cuda.get_device_name(0)}")
            else:
                print("🐌 Using CPU (slower)")
            
            self.tts_model = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2", gpu=cuda_available)
            self.is_model_loaded = True
            print("✅ XTTS model loaded successfully")
            return True
            
        except Exception as e:
            print(f"❌ Failed to load XTTS model: {e}")
            return False

    def _load_voicelines(self) -> Dict:
        """Load voicelines from JSON file."""
        print("📖 Loading voicelines from JSON...")
        
        try:
            with open(self.json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            total_lines = sum(len(category_data) for category_data in data.values())
            print(f"✅ Loaded {len(data)} categories with {total_lines} total voicelines")
            return data
            
        except FileNotFoundError:
            print(f"❌ JSON file not found: {self.json_file}")
            return {}
        except json.JSONDecodeError as e:
            print(f"❌ Error reading JSON: {e}")
            return {}

    def _sanitize_filename(self, text: str) -> str:
        """Convert text to a safe filename."""
        # Remove or replace problematic characters
        filename = re.sub(r'[<>:"/\\|?*]', '', text)
        filename = re.sub(r'[^\w\s\-_.]', '_', filename)
        filename = re.sub(r'\s+', '_', filename)
        filename = filename.strip('_')
        
        # Limit length
        if len(filename) > 100:
            filename = filename[:100]
        
        return filename

    def _generate_audio(self, text: str, output_path: Path) -> bool:
        """Generate TTS audio for a single voiceline."""
        try:
            self.tts_model.tts_to_file(
                text=text,
                file_path=str(output_path),
                speaker_wav=str(self.ana_voice_file),
                language="en"
            )
            return True
        except Exception as e:
            print(f"\n❌ Error generating audio: {e}")
            return False

    def generate_all_audio(self, skip_existing: bool = True) -> bool:
        """Generate audio files for all voicelines."""
        print("\n🎙️  Starting batch TTS generation...")
        
        # Check dependencies
        if not self._check_dependencies():
            return False
        
        # Find voice file
        if not self._find_ana_voice():
            return False
        
        # Load TTS model
        if not self._load_tts_model():
            return False
        
        # Load voicelines
        voicelines = self._load_voicelines()
        if not voicelines:
            return False
        
        # Calculate totals
        total_files = 0
        for category_data in voicelines.values():
            total_files += len(category_data)
        
        print(f"\n🚀 Generating {total_files} audio files...")
        print("=" * 60)
        
        current_file = 0
        successful = 0
        skipped = 0
        failed = 0
        
        start_time = time.time()
        
        # Process each category
        for category, category_data in voicelines.items():
            print(f"\n📁 Processing category: {category}")
            
            # Create category directory
            category_dir = self.base_dir / category
            category_dir.mkdir(exist_ok=True)
            
            # Process each voiceline in the category
            for name, text in category_data.items():
                current_file += 1
                
                # Create filename
                safe_name = self._sanitize_filename(name)
                output_file = category_dir / f"{safe_name}.wav"
                
                # Update progress bar
                progress_bar = create_progress_bar(current_file, total_files)
                print(f"\r{progress_bar} {safe_name[:30]:<30}", end="", flush=True)
                
                # Skip if file already exists
                if skip_existing and output_file.exists():
                    skipped += 1
                    continue
                
                # Generate audio
                if self._generate_audio(text, output_file):
                    successful += 1
                else:
                    failed += 1
        
        # Final progress
        progress_bar = create_progress_bar(total_files, total_files)
        print(f"\r{progress_bar} Complete!{' ' * 30}")
        
        # Summary
        elapsed_time = time.time() - start_time
        print(f"\n🏁 Batch generation complete!")
        print("=" * 50)
        print(f"✅ Successful: {successful}")
        print(f"⏭️  Skipped: {skipped}")
        print(f"❌ Failed: {failed}")
        print(f"⏱️  Time: {elapsed_time:.1f} seconds")
        
        if successful > 0:
            avg_time = elapsed_time / successful
            print(f"📊 Average: {avg_time:.1f}s per file")
        
        return failed == 0

    def list_voicelines(self) -> None:
        """List all voicelines by category."""
        voicelines = self._load_voicelines()
        if not voicelines:
            return
        
        print("\n📋 Voiceline Summary:")
        print("=" * 50)
        
        total_lines = 0
        for category, category_data in voicelines.items():
            count = len(category_data)
            total_lines += count
            print(f"📁 {category}: {count} voicelines")
        
        print(f"\n🎯 Total: {total_lines} voicelines across {len(voicelines)} categories")


def main():
    """Main entry point."""
    generator = OHRBatchTTSGenerator()
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "generate":
            # Check for --force flag
            force = "--force" in sys.argv
            skip_existing = not force
            
            if force:
                print("🔄 Force mode: Will overwrite existing files")
            else:
                print("⏭️  Skip mode: Will skip existing files (use --force to overwrite)")
            
            success = generator.generate_all_audio(skip_existing=skip_existing)
            if success:
                print("\n🎉 All audio files generated successfully!")
            else:
                print("\n⚠️  Some files failed to generate")
        
        elif command == "list":
            generator.list_voicelines()
        
        else:
            print(f"❌ Unknown command: {command}")
            print("Available commands: generate, list")
    
    else:
        print("\n🎮 OHR Batch TTS Generator")
        print("Usage:")
        print("  python ohr_voiceline_manager.py generate [--force]")
        print("  python ohr_voiceline_manager.py list")
        print("\nCommands:")
        print("  generate     Generate all TTS audio files")
        print("  generate --force    Overwrite existing files")
        print("  list         Show voiceline summary")


if __name__ == "__main__":
    main()