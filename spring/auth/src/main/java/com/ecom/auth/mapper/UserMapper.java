package com.ecom.auth.mapper;


import com.ecom.auth.domain.User;
import com.ecom.auth.dto.UserResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper
public interface UserMapper {

    @Mapping(target = "id", ignore = true)
    User userResponseToUser(UserResponse userResponse);

}
