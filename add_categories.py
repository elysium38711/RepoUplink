#!/usr/bin/env python3
# Script to add new categories to randomItemPools

# Read the current app.js file
with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find line 1965 which has 'Favorite Beverages' (the last category)
# We need to add a comma after line 1965 and insert new categories before line 1966

# New categories - shortened for space, using representative examples
new_categories_text = """,
    'Best 90s Sitcoms': ['Friends', 'Seinfeld', 'The Fresh Prince of Bel-Air', 'Frasier', 'ER', 'The X-Files', 'Buffy the Vampire Slayer', 'Will & Grace', 'Home Improvement', 'Boy Meets World', 'Full House', 'Family Matters', 'Saved by the Bell', 'Step by Step', 'Sister, Sister', 'The Nanny', 'Blossom', 'Living Single', 'Martin', 'The Wayans Bros.', 'Moesha', 'Sabrina the Teenage Witch', 'Dawson\\'s Creek', 'Felicity', 'Charmed', 'Ally McBeal', 'Everybody Loves Raymond', 'That \\'70s Show', 'The King of Queens', '3rd Rock from the Sun', 'NewsRadio', 'Spin City', 'Just Shoot Me!', 'Caroline in the City', 'Mad About You', 'Wings', 'Cheers', 'Golden Girls', 'Murphy Brown', 'Designing Women', 'Northern Exposure', 'Twin Peaks', 'Star Trek: The Next Generation', 'Star Trek: Deep Space Nine', 'Star Trek: Voyager', 'Babylon 5'],
    'Favorite Anime Series': ['Attack on Titan', 'Death Note', 'Fullmetal Alchemist: Brotherhood', 'One Piece', 'Naruto', 'Dragon Ball Z', 'My Hero Academia', 'Demon Slayer', 'Jujutsu Kaisen', 'Spy x Family', 'Chainsaw Man', 'Hunter x Hunter', 'One Punch Man', 'Mob Psycho 100', 'Steins;Gate', 'Code Geass', 'Neon Genesis Evangelion', 'Cowboy Bebop', 'Samurai Champloo', 'Bleach', 'Fairy Tail', 'Tokyo Ghoul', 'Parasyte', 'Sword Art Online', 'Re:Zero', 'The Rising of the Shield Hero', 'That Time I Got Reincarnated as a Slime', 'Overlord', 'Konosuba', 'No Game No Life', 'The Promised Neverland', 'Vinland Saga', 'Made in Abyss', 'Dr. Stone', 'Fire Force', 'Black Clover', 'Boruto', 'Fruits Basket', 'Ouran High School Host Club', 'Your Lie in April', 'Anohana', 'Clannad', 'A Silent Voice', 'Your Name', 'Weathering with You', 'Violet Evergarden', 'K-On!', 'Love Live!', 'The Melancholy of Haruhi Suzumiya', 'Toradora!'],
    'Best Horror Movies': ['The Shining', 'The Exorcist', 'Halloween', 'A Nightmare on Elm Street', 'Friday the 13th', 'Scream', 'The Texas Chain Saw Massacre', 'Psycho', 'The Silence of the Lambs', 'Get Out', 'Hereditary', 'The Conjuring', 'Insidious', 'Sinister', 'It', 'The Ring', 'The Grudge', 'Paranormal Activity', 'The Blair Witch Project', 'Saw', 'Hostel', 'The Descent', '28 Days Later', 'Train to Busan', 'A Quiet Place', 'Bird Box', 'Us', 'Midsommar', 'The Lighthouse', 'The Witch', 'It Follows', 'Candyman', 'The Babadook', 'Don\\'t Breathe', 'Lights Out', 'Annabelle', 'The Nun', 'Ouija', 'Carrie', 'Misery', 'Pet Sematary', 'Children of the Corn', 'The Mist', 'Poltergeist', 'Amityville Horror', 'The Omen', 'Rosemary\\'s Baby', 'Hellraiser', 'Child\\'s Play'],
    'Top Action Movies': ['Die Hard', 'Mad Max: Fury Road', 'The Matrix', 'Terminator 2', 'John Wick', 'The Dark Knight', 'Inception', 'Raiders of the Lost Ark', 'Aliens', 'The Bourne Identity', 'Mission: Impossible', 'Speed', 'True Lies', 'The Rock', 'Lethal Weapon', 'Rambo', 'Rocky', 'Gladiator', 'Braveheart', '300', 'Kill Bill', 'Taken', 'The Raid', 'Dredd', 'Edge of Tomorrow', 'Baby Driver', 'Kingsman', 'Atomic Blonde', 'Red Notice', 'The Gray Man', 'Extraction', 'The Equalizer', 'Nobody', 'Old Guard', 'Fast & Furious', 'Point Break', 'Con Air', 'Face/Off', 'The Fugitive', 'Heat', 'Collateral', 'Miami Vice', 'Bad Boys', 'Rush Hour', 'Beverly Hills Cop', '48 Hrs.', 'Total Recall', 'Predator', 'Commando']
"""

# Insert the new categories after line 1965 (index 1964)
# First, modify line 1965 to not have the closing part yet
if lines[1964].rstrip().endswith(']'):
    lines[1964] = lines[1964].rstrip() + new_categories_text + '\n'

# Write back to file
with open('app.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Successfully added first batch of categories!')
