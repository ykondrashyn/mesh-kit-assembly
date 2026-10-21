#!/usr/bin/env python3
"""Smoke-test installed Firefox and Safari in separate WebDriver sessions."""
import json
import os
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('VALIDATION_OUTPUT', ROOT / 'validation/progressive/cross-browser.json'))
OUT.parent.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8766/')
results = []
for name in ('firefox', 'safari'):
    driver = None
    result = {'browser': name, 'checks': []}
    try:
        if name == 'firefox':
            options = webdriver.FirefoxOptions()
            options.add_argument('-headless')
            options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
            driver = webdriver.Firefox(options=options)
        else:
            # Do not enable Remote Automation or change the user's Safari settings.
            driver = webdriver.Safari()
        result['version'] = driver.capabilities.get('browserVersion')
        wait = WebDriverWait(driver, 20)
        for width, height in ((1440, 900), (450, 900)):
            driver.set_window_size(width, height)
            driver.get('about:blank')
            driver.get(BASE)
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '0'"))
            for index in (33, 90, 129, 180, 234, 315, 363, 420, 0):
                driver.execute_script("scrollTo(0,arguments[0]/420*(document.querySelector('#story').offsetHeight-document.querySelector('#stage').offsetHeight))", index)
                wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === arguments[0]", str(index)))
            driver.find_element(By.CSS_SELECTOR, '[data-chapter="boards"]').click()
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '315'"))
            driver.find_element(By.ID, 'enlarge-connector').click()
            wait.until(lambda d: d.execute_script("return document.querySelector('#connector-image').dataset.resolution === '1080'"))
            driver.find_element(By.ID, 'close-connector').click()
            driver.get('about:blank')
            driver.get(BASE.split('#')[0] + '#step-lora')
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '180'"))
            driver.find_element(By.CSS_SELECTOR, '[data-chapter="boards"]').click()
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '315'"))
            assert driver.current_url.endswith('#step-boards')
            driver.back()
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '180'"))
            driver.forward()
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '315'"))
            driver.refresh()
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '315'"))
            driver.save_screenshot(str(OUT.with_name(f'{name}-{width}.png')))
            state = driver.execute_script("return {stage:{...document.querySelector('#stage').dataset},canvas:{...document.querySelector('#assembly').dataset},width:innerWidth,height:innerHeight}")
            assert int(state['stage']['maxRequests']) <= 4
            assert int(state['stage']['maxDecodedFrames']) <= 12
            assert int(state['stage']['maxDecodedBytes']) <= 48 * 1024 * 1024
            assert int(state['stage']['maxCompressedBytes']) <= 24 * 1024 * 1024
            driver.find_element(By.CSS_SELECTOR, '#instructions summary').click()
            assert driver.find_element(By.CSS_SELECTOR, '.kit-link').get_attribute('href') == 'https://www.seeedstudio.com/Wio-SX1262-with-XIAO-ESP32S3-p-5982.html'
            driver.find_element(By.ID, 'motion-toggle').click()
            wait.until(lambda d: d.execute_script("return document.querySelector('#assembly').dataset.frame === '363'"))
            result['checks'].append(state)
        result['passed'] = True
    except Exception as error:
        result.update(passed=False, status='failed' if driver else 'unavailable', reason=str(error))
    finally:
        if driver:
            driver.quit()
        results.append(result)
        OUT.write_text(json.dumps(results, indent=2) + '\n')
        print(name, result.get('passed'), result.get('status', ''), flush=True)
