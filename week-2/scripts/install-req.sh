#!/bin/bash
# Apache, PHP and MySQL installation for WordPress
# AMI: Amazon Linux 2023 (ami-0236886b69bdc43a8)

set -euo pipefail

# --- Variables ---
WP_DB_NAME="wordpress"
WP_DB_USER="wpuser"
WP_DB_PASSWORD="WpPassw0rd!"
MYSQL_ROOT_PASSWORD="RootPassw0rd!"


# --- Apache ---
dnf install -y httpd
systemctl enable httpd
systemctl start httpd

# --- PHP and extensions required by WordPress ---
dnf install -y \
    php \
    php-cli \
    php-mysqlnd \
    php-gd \
    php-xml \
    php-mbstring \
    php-json \
    php-curl \
    php-zip \
    php-intl \
    php-opcache

# Restart Apache to load PHP modules
systemctl restart httpd

# --- MySQL ---
# AL2023 does not include MySQL in its default repos; add the official MySQL repo first
dnf install -y wget
wget https://dev.mysql.com/get/mysql80-community-release-el9-1.noarch.rpm
dnf install -y mysql80-community-release-el9-1.noarch.rpm
rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2023
dnf install -y mysql-community-server

systemctl enable mysqld
systemctl start mysqld

# Wait for MySQL to start
sleep 5

# Retrieve the temporary root password and change it
TEMP_PASS=$(grep 'temporary password' /var/log/mysqld.log 2>/dev/null | tail -1 | awk '{print $NF}')

if [ -n "$TEMP_PASS" ]; then
    mysql --connect-expired-password -uroot -p"${TEMP_PASS}" <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
FLUSH PRIVILEGES;
EOF
fi

# Create the WordPress database and user
mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOF
CREATE DATABASE IF NOT EXISTS \`${WP_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '${WP_DB_USER}'@'%' IDENTIFIED BY '${WP_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${WP_DB_NAME}\`.* TO '${WP_DB_USER}'@'%';
FLUSH PRIVILEGES;
EOF

echo "Installation complete."
echo "DB: ${WP_DB_NAME} | User: ${WP_DB_USER} | Password: ${WP_DB_PASSWORD}"