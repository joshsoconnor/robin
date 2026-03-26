package com.robin.app;
import java.lang.reflect.Method;
public class TestReflect {
    public static void main(String[] args) throws Exception {
        Class<?> clazz = Class.forName("com.google.android.libraries.navigation.Navigator");
        for (Method m : clazz.getMethods()) {
            System.out.println("Navigator method: " + m.getName() + " returns " + m.getReturnType().getName());
        }
    }
}
