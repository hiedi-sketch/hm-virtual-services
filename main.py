import threading
import schedule
import time
from hmvs_backup_to_drive import run_backup


def run_scheduler():
    schedule.every().friday.at("21:00").do(run_backup)
    while True:
        schedule.run_pending()
        time.sleep(60)


def main():
    print("Hello from repl-nix-workspace!")
    scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()


if __name__ == "__main__":
    main()
