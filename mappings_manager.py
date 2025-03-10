# mappings_manager.py
#!/usr/bin/env python3
"""
Mappings Manager for DAKOSYS
Handles loading and saving anime mappings
"""

import os
import yaml
import logging
from rich.console import Console

# Initialize console for rich output
console = Console()

# Setup logging
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("data/mappings.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("mappings_manager")

# Constants
CONFIG_DIR = "config"
if os.environ.get('RUNNING_IN_DOCKER') == 'true':
    CONFIG_DIR = "/app/config"

MAPPINGS_FILE = os.path.join(CONFIG_DIR, "mappings.yaml")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.yaml")

def load_mappings():
    """Load mappings from the mappings file or fallback to config."""
    # First try to load from dedicated mappings file
    if os.path.exists(MAPPINGS_FILE):
        try:
            with open(MAPPINGS_FILE, 'r') as file:
                mappings = yaml.safe_load(file)
                # Ensure all mapping sections exist
                if 'mappings' not in mappings:
                    mappings['mappings'] = {}
                if 'trakt_mappings' not in mappings:
                    mappings['trakt_mappings'] = {}
                if 'title_mappings' not in mappings:
                    mappings['title_mappings'] = {}
                    
                return mappings
        except Exception as e:
            logger.error(f"Error loading mappings from {MAPPINGS_FILE}: {str(e)}")

    # Fallback to loading from config
    logger.info("Mappings file not found, loading from config...")
    try:
        with open(CONFIG_FILE, 'r') as file:
            config = yaml.safe_load(file)
            # Extract mappings from config
            mappings = {}
            mappings['mappings'] = config.get('mappings', {})
            mappings['trakt_mappings'] = config.get('trakt_mappings', {})
            mappings['title_mappings'] = config.get('title_mappings', {})

            # Automatically migrate mappings to separate file
            save_mappings(mappings, migrate_from_config=True)
            logger.info("Automatically migrated mappings from config.yaml to mappings.yaml")

            return mappings
    except Exception as e:
        logger.error(f"Error loading mappings from config: {str(e)}")
        return {'mappings': {}, 'trakt_mappings': {}, 'title_mappings': {}}

def save_mappings(mappings, migrate_from_config=False):
    """Save mappings to the dedicated mappings file."""
    try:
        # Make sure the directory exists
        os.makedirs(os.path.dirname(MAPPINGS_FILE), exist_ok=True)
        
        # Save to mappings file
        with open(MAPPINGS_FILE, 'w') as file:
            yaml.dump(mappings, file)
        
        logger.info(f"Saved mappings to {MAPPINGS_FILE}")
        
        # If we're migrating from config, update the config to remove mappings
        if migrate_from_config and os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as file:
                    config = yaml.safe_load(file)
                
                # Remove mappings that are now in the dedicated file
                if 'mappings' in config:
                    del config['mappings']
                if 'trakt_mappings' in config:
                    del config['trakt_mappings']
                if 'title_mappings' in config:
                    del config['title_mappings']
                
                # Save updated config
                with open(CONFIG_FILE, 'w') as file:
                    yaml.dump(config, file)
                
                logger.info(f"Updated {CONFIG_FILE} to remove migrated mappings")
            except Exception as e:
                logger.error(f"Error updating config after migration: {str(e)}")
        
        return True
    except Exception as e:
        logger.error(f"Error saving mappings: {str(e)}")
        return False

def add_plex_mapping(afl_name, plex_name):
    """Add a mapping from AFL name to Plex name."""
    try:
        mappings = load_mappings()
        
        # Ensure mappings section exists
        if 'mappings' not in mappings:
            mappings['mappings'] = {}
        
        # Add or update the mapping
        mappings['mappings'][afl_name] = plex_name
        
        # Save the updated mappings
        return save_mappings(mappings)
    except Exception as e:
        logger.error(f"Error adding Plex mapping: {str(e)}")
        return False

def add_title_mapping(anime_name, episode_title, trakt_title):
    """Add a title mapping for an episode."""
    try:
        mappings = load_mappings()

        # Ensure title_mappings section exists and is not None
        if 'title_mappings' not in mappings or mappings['title_mappings'] is None:
            mappings['title_mappings'] = {}

        # Ensure anime section exists
        if anime_name not in mappings['title_mappings']:
            mappings['title_mappings'][anime_name] = {}
            
        # Ensure special_matches exists and is not None
        if 'special_matches' not in mappings['title_mappings'][anime_name] or mappings['title_mappings'][anime_name]['special_matches'] is None:
            mappings['title_mappings'][anime_name]['special_matches'] = {}

        # Add the title mapping
        mappings['title_mappings'][anime_name]['special_matches'][episode_title] = trakt_title

        # Save the updated mappings
        return save_mappings(mappings)
    except Exception as e:
        logger.error(f"Error adding title mapping: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def migrate_mappings_from_config():
    """Migrate all mappings from config.yaml to mappings.yaml."""
    try:
        # Load current mappings from config
        mappings = load_mappings()
        
        # Save to dedicated file and update config
        return save_mappings(mappings, migrate_from_config=True)
    except Exception as e:
        logger.error(f"Error migrating mappings: {str(e)}")
        return False

def get_mappings():
    """Get all mappings."""
    return load_mappings()

def get_plex_name(afl_name):
    """Get Plex name for an AFL name."""
    mappings = load_mappings()
    plex_name = mappings.get('mappings', {}).get(afl_name, afl_name)
    
    # If still in AFL format, convert to display format
    if '-' in plex_name:
        plex_name = plex_name.replace('-', ' ').title()
    
    return plex_name

# CLI Command to migrate mappings
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "migrate":
        console.print("[bold]Migrating mappings from config.yaml to mappings.yaml...[/bold]")
        if migrate_mappings_from_config():
            console.print("[bold green]Migration complete![/bold green]")
            console.print("[yellow]Your mappings are now stored in mappings.yaml[/yellow]")
        else:
            console.print("[bold red]Migration failed. See logs for details.[/bold red]")
    else:
        console.print("[bold]DAKOSYS Mappings Manager[/bold]")
        console.print("Usage: python mappings_manager.py migrate")
