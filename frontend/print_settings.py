with open("src/components/settings/AISettings.tsx") as f:
    lines = f.readlines()
    for i in range(95, 110):
        print(f"{i+1}: {lines[i].rstrip()}")
